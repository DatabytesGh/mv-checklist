import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { publishFaultActivity } from "@/lib/activity";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { usesInventoryUserSchema } from "@/lib/users-db";
import { newFaultId, newPhotoId, tableIdIsText } from "@/lib/sessions-db";
import {
  friendlyWhatsAppError,
  getWhatsAppConfigStatus,
} from "@/lib/whatsapp";
import { notifyFaultToVendor } from "@/lib/whatsapp-notify";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const inv = usesInventoryUserSchema(db);
  const reporterCol = inv ? "u.full_name" : "u.display_name";
  const resolverCol = inv ? "r.full_name" : "r.display_name";
  const faults = db
    .prepare(
      `SELECT f.*, v.name as vendor_name,
              v.whatsapp_number as vendor_whatsapp,
              v.phone as vendor_phone,
              ${reporterCol} as reporter_name,
              ${resolverCol} as resolver_name
       FROM fault_reports f
       LEFT JOIN vendors v ON v.id = f.vendor_id
       LEFT JOIN users u ON u.id = f.reported_by_user_id
       LEFT JOIN users r ON r.id = f.resolved_by_user_id
       ORDER BY f.reported_at DESC LIMIT 200`,
    )
    .all() as Array<{ id: string | number }>;

  const photos = db
    .prepare(
      `SELECT fault_report_id, file_path FROM fault_photos ORDER BY uploaded_at`,
    )
    .all() as Array<{ fault_report_id: string | number; file_path: string }>;

  const photosByFault = new Map<string | number, string[]>();
  for (const p of photos) {
    const list = photosByFault.get(p.fault_report_id) ?? [];
    list.push(p.file_path);
    photosByFault.set(p.fault_report_id, list);
  }

  const withPhotos = faults.map((f) => ({
    ...f,
    photos: photosByFault.get(f.id) ?? [],
  }));

  return NextResponse.json({ faults: withPhotos });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.reportFault) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const rawSessionId = String(form.get("sessionId") ?? "").trim();
  // "", "null" and "undefined" all mean "standalone fault" (no linked session).
  const sessionId =
    rawSessionId && rawSessionId !== "null" && rawSessionId !== "undefined"
      ? rawSessionId
      : null;
  const itemResponseIdRaw = form.get("itemResponseId");
  const itemResponseId = itemResponseIdRaw
    ? String(itemResponseIdRaw).trim()
    : null;
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const severity = String(form.get("severity") ?? "medium");
  const vendorIdRaw = form.get("vendorId");
  const vendorId = vendorIdRaw ? String(vendorIdRaw).trim() : null;

  if (!title || !description) {
    return NextResponse.json(
      { error: "Title and description are required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const textFaultId = tableIdIsText(db, "fault_reports");
  let faultId: string | number;

  if (textFaultId) {
    faultId = newFaultId();
    db.prepare(
      `INSERT INTO fault_reports (id, session_id, item_response_id, title, description, location, severity, vendor_id, reported_by_user_id, reported_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'open')`,
    ).run(
      faultId,
      sessionId,
      itemResponseId,
      title,
      description,
      location || null,
      severity,
      vendorId,
      user.id,
    );
  } else {
    const result = db
      .prepare(
        `INSERT INTO fault_reports (session_id, item_response_id, title, description, location, severity, vendor_id, reported_by_user_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      )
      .run(
        sessionId,
        itemResponseId,
        title,
        description,
        location || null,
        severity,
        vendorId,
        user.id,
      );
    faultId = Number(result.lastInsertRowid);
  }

  // Standalone faults use their own id as the upload folder so photos never
  // collide with checklist-scoped faults (which are grouped by session).
  const uploadFolder = sessionId ?? `adhoc-${faultId}`;
  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "faults",
    uploadFolder,
  );
  mkdirSync(uploadDir, { recursive: true });

  const photos: string[] = [];
  for (let i = 0; i < 3; i++) {
    const file = form.get(`photo${i}`) as File | null;
    if (!file || file.size === 0) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${i}.jpg`;
    const rel = `/uploads/faults/${uploadFolder}/${filename}`;
    writeFileSync(path.join(uploadDir, filename), buf);
    if (tableIdIsText(db, "fault_photos")) {
      db.prepare(
        `INSERT INTO fault_photos (id, fault_report_id, file_path, uploaded_by_user_id, uploaded_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      ).run(newPhotoId(), faultId, rel, user.id);
    } else {
      db.prepare(
        `INSERT INTO fault_photos (fault_report_id, file_path, uploaded_by_user_id) VALUES (?, ?, ?)`,
      ).run(faultId, rel, user.id);
    }
    photos.push(rel);
  }

  logAudit(user.id, "fault_reported", "fault", String(faultId), title);
  publishFaultActivity("fault.reported", {
    faultId: String(faultId),
    sessionId: sessionId ?? "",
    actorUserId: user.id,
    actorName: user.display_name ?? user.username,
    title,
  });

  return NextResponse.json({ id: faultId, photos });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  if (body.action === "resolve" && user.permissions.resolveFault) {
    const faultRow = db
      .prepare("SELECT session_id, title FROM fault_reports WHERE id = ?")
      .get(body.faultId) as { session_id: string; title: string } | undefined;
    db.prepare(
      `UPDATE fault_reports SET status = 'resolved', resolved_by_user_id = ?, resolved_at = datetime('now'), resolution_notes = ? WHERE id = ?`,
    ).run(user.id, body.notes ?? null, body.faultId);
    logAudit(user.id, "fault_resolved", "fault", String(body.faultId));
    if (faultRow) {
      publishFaultActivity("fault.resolved", {
        faultId: String(body.faultId),
        sessionId: faultRow.session_id,
        actorUserId: user.id,
        actorName: user.display_name ?? user.username,
        title: faultRow.title,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Direct Meta Cloud API send to the assigned vendor.
  if (body.action === "send_whatsapp") {
    if (!getWhatsAppConfigStatus().configured) {
      return NextResponse.json(
        {
          error:
            "WhatsApp API not configured — set META_WA_TOKEN and META_WA_PHONE_ID in .env.local and restart the server.",
        },
        { status: 503 },
      );
    }

    const inv = usesInventoryUserSchema(db);
    const reporterCol = inv ? "u.full_name" : "u.display_name";
    const fault = db
      .prepare(
        `SELECT f.*, v.name as vendor_name,
                v.whatsapp_number as vendor_whatsapp,
                v.phone as vendor_phone,
                ${reporterCol} as reporter_name
         FROM fault_reports f
         LEFT JOIN vendors v ON v.id = f.vendor_id
         LEFT JOIN users u ON u.id = f.reported_by_user_id
         WHERE f.id = ?`,
      )
      .get(body.faultId) as
      | {
          id: string | number;
          title: string;
          description: string;
          location: string | null;
          severity: string;
          vendor_whatsapp: string | null;
          vendor_phone: string | null;
          reporter_name: string | null;
        }
      | undefined;

    if (!fault) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const phone = (fault.vendor_whatsapp || fault.vendor_phone || "").trim();
    if (!phone) {
      return NextResponse.json(
        {
          error:
            "Vendor has no phone number — add one in Settings → Vendors.",
        },
        { status: 400 },
      );
    }

    const photoRows = db
      .prepare(
        `SELECT file_path FROM fault_photos WHERE fault_report_id = ? ORDER BY uploaded_at`,
      )
      .all(fault.id) as Array<{ file_path: string }>;

    const sendResult = await notifyFaultToVendor({
      to: phone,
      staffName:
        fault.reporter_name?.trim() ||
        user.display_name ||
        user.username ||
        "Staff",
      location: fault.location?.trim() || "-",
      itemName: fault.title,
      severity: fault.severity,
      description: fault.description,
      photoPaths: photoRows.map((p) => p.file_path),
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        {
          error: friendlyWhatsAppError(sendResult),
          errorCode: sendResult.errorCode,
        },
        { status: 502 },
      );
    }

    db.prepare(
      `UPDATE fault_reports SET whatsapp_sent = 1, whatsapp_sent_at = datetime('now'), status = 'reported' WHERE id = ?`,
    ).run(body.faultId);
    logAudit(user.id, "fault_whatsapp_sent", "fault", String(body.faultId));
    return NextResponse.json({
      ok: true,
      messageId: sendResult.messageId,
      to: phone,
    });
  }

  // Legacy: record a client-side hand-off without sending via Cloud API.
  if (body.action === "mark_whatsapp_sent") {
    const fault = db
      .prepare(`SELECT id FROM fault_reports WHERE id = ?`)
      .get(body.faultId) as { id: string | number } | undefined;
    if (!fault) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    db.prepare(
      `UPDATE fault_reports SET whatsapp_sent = 1, whatsapp_sent_at = datetime('now'), status = 'reported' WHERE id = ?`,
    ).run(body.faultId);
    logAudit(user.id, "fault_whatsapp_sent", "fault", String(body.faultId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
