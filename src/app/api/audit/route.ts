import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.viewAuditLog) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action");
  const db = getDb();

  let logs;
  if (action) {
    logs = db
      .prepare(
        `SELECT a.*, u.username FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.action = ? ORDER BY a.created_at DESC LIMIT 200`,
      )
      .all(action);
  } else {
    logs = db
      .prepare(
        `SELECT a.*, u.username FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 200`,
      )
      .all();
  }

  return NextResponse.json({ logs });
}