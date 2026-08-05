import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureStaffTable, listStaff } from "@/lib/staff";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const includeInactive = Boolean(user.permissions.manageSettings);
  const staff = listStaff(db, { includeInactive });
  return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const db = getDb();
  ensureStaffTable(db);

  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(display_order), 0) AS m FROM staff`)
    .get() as { m: number };

  try {
    const result = db
      .prepare(
        `INSERT INTO staff (name, is_active, display_order) VALUES (?, ?, ?)`,
      )
      .run(name, body.is_active === false ? 0 : 1, maxOrder.m + 1);
    logAudit(user.id, "staff_created", "staff", String(result.lastInsertRowid));
    return NextResponse.json({ id: result.lastInsertRowid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "That name is already in the staff list" },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (body.id == null) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const name = String(body.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const db = getDb();
  ensureStaffTable(db);

  try {
    db.prepare(
      `UPDATE staff SET name = ?, is_active = ?, display_order = COALESCE(?, display_order) WHERE id = ?`,
    ).run(
      name,
      body.is_active ? 1 : 0,
      typeof body.display_order === "number" ? body.display_order : null,
      body.id,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "That name is already in the staff list" },
        { status: 409 },
      );
    }
    throw err;
  }

  logAudit(user.id, "staff_updated", "staff", String(body.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (id == null) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  ensureStaffTable(db);
  // Soft-delete so historical checklist responses keep a readable name.
  db.prepare(`UPDATE staff SET is_active = 0 WHERE id = ?`).run(id);
  logAudit(user.id, "staff_deactivated", "staff", String(id));
  return NextResponse.json({ ok: true });
}
