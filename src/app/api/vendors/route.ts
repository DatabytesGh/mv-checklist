import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const all = user.permissions.manageVendors;
  const vendors = db
    .prepare(
      all
        ? `SELECT * FROM vendors ORDER BY name`
        : `SELECT * FROM vendors WHERE is_active = 1 ORDER BY name`,
    )
    .all();
  return NextResponse.json({ vendors });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageVendors) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO vendors (name, type, phone, whatsapp_number, email, specialization, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.name,
      body.type ?? "vendor",
      body.phone ?? null,
      body.whatsapp_number ?? null,
      body.email ?? null,
      body.specialization ?? null,
      body.notes ?? null,
    );

  logAudit(user.id, "vendor_created", "vendor", String(result.lastInsertRowid));
  return NextResponse.json({ id: result.lastInsertRowid });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageVendors) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  db.prepare(
    `UPDATE vendors SET name=?, type=?, phone=?, whatsapp_number=?, email=?, specialization=?, notes=?, is_active=? WHERE id=?`,
  ).run(
    body.name,
    body.type,
    body.phone,
    body.whatsapp_number,
    body.email,
    body.specialization,
    body.notes,
    body.is_active ? 1 : 0,
    body.id,
  );

  logAudit(user.id, "vendor_updated", "vendor", String(body.id));
  return NextResponse.json({ ok: true });
}
