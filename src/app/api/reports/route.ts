import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, todayDate } from "@/lib/db";
import { usesInventoryUserSchema } from "@/lib/users-db";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.permissions.viewReports) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const date = todayDate();

  const completion = db
    .prepare(
      `SELECT t.label, s.status, s.id
       FROM checklist_types t
       LEFT JOIN checklist_sessions s ON s.checklist_type_slug = t.slug AND s.date = ? AND s.conference_id IS NULL
       WHERE t.frequency = 'daily' AND t.is_active = 1
       ORDER BY t.display_order`,
    )
    .all(date);

  const faultSummary = db
    .prepare(
      `SELECT severity, status, COUNT(*) as count FROM fault_reports GROUP BY severity, status`,
    )
    .all();

  const nameCol = usesInventoryUserSchema(db) ? "u.full_name" : "u.display_name";
  const staffPerf = db
    .prepare(
      `SELECT ${nameCol} as display_name, COUNT(*) as submissions
       FROM checklist_sessions s
       JOIN users u ON u.id = s.started_by_user_id
       WHERE s.submitted_at IS NOT NULL AND date(s.submitted_at) >= date('now', '-7 days')
       GROUP BY u.id ORDER BY submissions DESC LIMIT 10`,
    )
    .all();

  const openFaults = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM fault_reports WHERE status NOT IN ('resolved', 'closed')`,
      )
      .get() as { c: number }
  ).c;

  return NextResponse.json({
    date,
    completion,
    faultSummary,
    staffPerf,
    openFaults,
  });
}
