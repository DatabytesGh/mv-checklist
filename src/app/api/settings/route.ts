import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
    key: string;
    value: string;
  }>;
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  for (const [key, value] of Object.entries(body.settings ?? {})) {
    upsert.run(key, String(value));
  }

  logAudit(user.id, "settings_changed", "settings", null, JSON.stringify(body.settings));
  return NextResponse.json({ ok: true });
}
