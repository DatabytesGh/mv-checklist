import { NextRequest, NextResponse, after } from "next/server";
import { publishSessionActivity } from "@/lib/activity";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { usesInventoryUserSchema } from "@/lib/users-db";
import {
  markPendingItemsNotDone,
  resolveChecklistType,
  sessionProgress,
  updateSessionStatus,
  validateSessionForSubmit,
} from "@/lib/checklists";
import {
  friendlyWhatsAppError,
  getWhatsAppConfigStatus,
} from "@/lib/whatsapp";
import {
  notifyChecklistSubmittedToRecipients,
  resolveNotificationPhones,
} from "@/lib/whatsapp-notify";
import { listStaff } from "@/lib/staff";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id || id === "null") {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM checklist_sessions WHERE id = ?")
    .get(id) as { checklist_type_slug: string } | undefined;
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const typeRow = resolveChecklistType(db, session.checklist_type_slug);
  if (!typeRow) {
    return NextResponse.json(
      { error: `Checklist type "${session.checklist_type_slug}" is not configured` },
      { status: 404 },
    );
  }

  const nameCol = usesInventoryUserSchema(db) ? "full_name" : "display_name";

  const templates = db
    .prepare(
      `SELECT t.*,
              r.id AS response_id,
              r.status AS response_status,
              r.text_value,
              r.time_value,
              r.checked_at,
              r.checked_by_user_id,
              u.${nameCol} AS checked_by_name,
              u.username AS checked_by_username
       FROM checklist_templates t
       LEFT JOIN checklist_item_responses r
         ON r.template_item_id = t.id AND r.session_id = ?
       LEFT JOIN users u ON u.id = r.checked_by_user_id
       WHERE t.checklist_type_slug = ? AND t.is_active = 1
       ORDER BY t.section, t.item_order`,
    )
    .all(id, typeRow.slug) as Array<{
    id: string | number;
    response_id: string | number | null;
  }>;

  // Map each item's response to its (most recent) logged fault, so the UI can
  // deep-link the fault icon straight to that fault.
  const faultRows = db
    .prepare(
      `SELECT id, item_response_id FROM fault_reports
       WHERE session_id = ? AND item_response_id IS NOT NULL
       ORDER BY reported_at DESC`,
    )
    .all(id) as Array<{ id: string | number; item_response_id: string | number }>;
  const faultByResponse = new Map<string, string | number>();
  for (const fr of faultRows) {
    const key = String(fr.item_response_id);
    if (!faultByResponse.has(key)) faultByResponse.set(key, fr.id);
  }

  // Photos attached to faults in this session, grouped by fault, so they can be
  // surfaced (read-only) on the originating checklist item.
  const faultPhotoRows = db
    .prepare(
      `SELECT fp.fault_report_id AS fid, fp.file_path AS url
       FROM fault_photos fp
       JOIN fault_reports fr ON fr.id = fp.fault_report_id
       WHERE fr.session_id = ?
       ORDER BY fp.uploaded_at`,
    )
    .all(id) as Array<{ fid: string | number; url: string }>;
  const faultPhotosByFault = new Map<string, string[]>();
  for (const fp of faultPhotoRows) {
    const k = String(fp.fid);
    const list = faultPhotosByFault.get(k) ?? [];
    list.push(fp.url);
    faultPhotosByFault.set(k, list);
  }

  const itemPhotoRows = db
    .prepare(
      `SELECT id, template_item_id, file_path
       FROM checklist_item_photos
       WHERE session_id = ? ORDER BY uploaded_at`,
    )
    .all(id) as Array<{
    id: string;
    template_item_id: string | number;
    file_path: string;
  }>;

  const photosByItem = new Map<string, Array<{ id: string; url: string }>>();
  for (const p of itemPhotoRows) {
    const key = String(p.template_item_id);
    const list = photosByItem.get(key) ?? [];
    list.push({ id: p.id, url: p.file_path });
    photosByItem.set(key, list);
  }

  const items = templates.map((t) => {
    const faultId =
      t.response_id != null
        ? (faultByResponse.get(String(t.response_id)) ?? null)
        : null;
    return {
      ...t,
      photos: photosByItem.get(String(t.id)) ?? [],
      faultId,
      faultPhotos:
        faultId != null ? (faultPhotosByFault.get(String(faultId)) ?? []) : [],
    };
  });

  // Shift-leader pickers use the staff directory (Settings → Staff), not app logins.
  const staff = listStaff(db);
  const shiftLeaders = staff.map((s) => ({
    id: String(s.id),
    display_name: s.name,
    username: s.name,
    name: s.name,
  }));

  return NextResponse.json({
    session,
    type: typeRow,
    items,
    progress: sessionProgress(id),
    shiftLeaders,
    staff,
    user,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id || id === "null") {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const sessionId = id;
  const body = await req.json();
  const db = getDb();

  const session = db
    .prepare("SELECT * FROM checklist_sessions WHERE id = ?")
    .get(sessionId) as {
    checklist_type_slug: string;
    status: string;
  } | undefined;
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const action = body.action as string;

  if (action === "submit") {
    // Unaddressed items become "not_done" (❌ in copy) so staff can omit work.
    markPendingItemsNotDone(sessionId, user.id);
    const validation = validateSessionForSubmit(sessionId);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const progress = sessionProgress(sessionId);
    updateSessionStatus(sessionId, "submitted");
    logAudit(user.id, "checklist_submitted", "session", String(sessionId));
    publishSessionActivity("checklist.submitted", {
      sessionId,
      actorUserId: user.id,
      actorName: user.display_name ?? user.username,
      status: "submitted",
    });

    // Fire-and-forget WhatsApp to RBAC recipients (Front Desk by default).
    if (getWhatsAppConfigStatus().configured) {
      const typeRow = resolveChecklistType(db, session.checklist_type_slug);
      const slug = typeRow?.slug ?? session.checklist_type_slug;
      const sess = db
        .prepare("SELECT date FROM checklist_sessions WHERE id = ?")
        .get(sessionId) as { date: string };
      const payload = {
        checklistSlug: slug,
        checklistLabel: typeRow?.label ?? slug,
        date: sess.date,
        submitterName: user.display_name ?? user.username,
        checked: progress.checked,
        total: progress.total,
        faulty: progress.faulty,
      };
      after(async () => {
        const results = await notifyChecklistSubmittedToRecipients(db, payload);
        for (const result of results) {
          if (!result.ok) {
            console.warn(
              "[whatsapp] submit notify failed:",
              result.errorCode ?? "",
              result.errorMessage ?? "unknown",
            );
          } else {
            console.info("[whatsapp] submit notify ok:", result.messageId);
          }
        }
      });
    }

    return NextResponse.json({ ok: true, progress });
  }

  if (action === "approve" && user.permissions.approveChecklist) {
    updateSessionStatus(sessionId, "approved", { approved_by: user.id });
    logAudit(user.id, "checklist_approved", "session", String(sessionId));
    publishSessionActivity("checklist.approved", {
      sessionId,
      actorUserId: user.id,
      actorName: user.display_name ?? user.username,
      status: "approved",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject" && user.permissions.approveChecklist) {
    if (!body.reason) {
      return NextResponse.json({ error: "Rejection reason required" }, { status: 400 });
    }
    updateSessionStatus(sessionId, "rejected", {
      rejection_reason: body.reason,
    });
    logAudit(user.id, "checklist_rejected", "session", String(sessionId), body.reason);
    publishSessionActivity("checklist.rejected", {
      sessionId,
      actorUserId: user.id,
      actorName: user.display_name ?? user.username,
      status: "rejected",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "notify_approver") {
    if (!getWhatsAppConfigStatus().configured) {
      return NextResponse.json(
        {
          error:
            "WhatsApp API not configured — set META_WA_TOKEN and META_WA_PHONE_ID in .env.local and restart the server.",
        },
        { status: 503 },
      );
    }

    const typeRow = resolveChecklistType(db, session.checklist_type_slug);
    const slugForSetting = typeRow?.slug ?? session.checklist_type_slug;
    const phones = resolveNotificationPhones(db, slugForSetting);
    if (phones.length === 0) {
      return NextResponse.json(
        {
          error:
            "No notification recipients — enable Receive WhatsApp notifications for a role in Settings → Roles, and set phones on those users (or Front desk WhatsApp in Settings → General).",
        },
        { status: 400 },
      );
    }

    const type = typeRow ?? { label: session.checklist_type_slug };
    const progress = sessionProgress(sessionId);
    const sess = db
      .prepare("SELECT date FROM checklist_sessions WHERE id = ?")
      .get(sessionId) as { date: string };

    const results = await notifyChecklistSubmittedToRecipients(db, {
      checklistSlug: slugForSetting,
      checklistLabel: type.label,
      date: sess.date,
      submitterName: user.display_name ?? user.username,
      checked: progress.checked,
      total: progress.total,
      faulty: progress.faulty,
    });
    const sendResult = results.find((r) => r.ok) ?? results[0];
    if (!sendResult?.ok) {
      return NextResponse.json(
        {
          error: friendlyWhatsAppError(sendResult),
          errorCode: sendResult?.errorCode,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      messageId: sendResult.messageId,
      to: phones,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
