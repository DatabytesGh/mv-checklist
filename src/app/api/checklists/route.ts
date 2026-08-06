import { NextResponse } from "next/server";
import { normalizeChecklistSlug, slugVariants } from "@/lib/checklist-slugs";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb, todayDate } from "@/lib/db";
import { canCompleteChecklist } from "@/lib/permissions";
import {
  getOrCreateSession,
  repairPrematureInProgressSessions,
  sessionProgress,
} from "@/lib/checklists";
import { usesInventoryUserSchema } from "@/lib/users-db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  repairPrematureInProgressSessions(db);
  const today = todayDate();

  const requested = new URL(req.url).searchParams.get("date");
  let date = today;
  if (requested && DATE_RE.test(requested)) {
    // Never allow future days — only today or earlier.
    date = requested > today ? today : requested;
  }
  const isToday = date === today;

  const nameCol = usesInventoryUserSchema(db) ? "full_name" : "display_name";

  const types = db
    .prepare(
      `SELECT * FROM checklist_types WHERE is_active = 1 ORDER BY display_order`,
    )
    .all() as Array<{
    slug: string;
    label: string;
    icon: string;
    frequency: string;
    completer_role: string;
    approver_role: string;
  }>;

  const contributorsForSession = (sessionId: string | number) =>
    db
      .prepare(
        `SELECT DISTINCT u.id AS id, u.${nameCol} AS name
         FROM checklist_item_responses r
         JOIN users u ON u.id = r.checked_by_user_id
         WHERE r.session_id = ? AND r.checked_by_user_id IS NOT NULL
         ORDER BY u.${nameCol}`,
      )
      .all(sessionId) as { id: string; name: string }[];

  // Daily-frequency types: one card per type (existing behaviour).
  // Event-frequency types (pre-conference etc.) are not surfaced generically —
  // they're only meaningful in the context of a specific conference, so we
  // append them below as one card per conference session.
  const dailyTypes = types.filter((t) => t.frequency !== "event");
  const result = dailyTypes.map((t) => {
    const canComplete = canCompleteChecklist(db, t.slug, user);
    const variants = slugVariants(t.slug);
    const inList = variants.map(() => "?").join(", ");
    const session = db
      .prepare(
        `SELECT cs.id, cs.status, cs.submitted_at, cs.approved_at,
                cs.started_by_user_id AS started_by_id,
                starter.${nameCol} AS started_by_name,
                approver.${nameCol} AS approved_by_name
         FROM checklist_sessions cs
         LEFT JOIN users starter ON starter.id = cs.started_by_user_id
         LEFT JOIN users approver ON approver.id = cs.approved_by_user_id
         WHERE cs.checklist_type_slug IN (${inList}) AND cs.date = ?
           AND cs.conference_id IS NULL AND cs.id IS NOT NULL
         ORDER BY cs.id DESC LIMIT 1`,
      )
      .get(...variants, date) as
      | {
          id: number | string;
          status: string;
          submitted_at: string | null;
          approved_at: string | null;
          started_by_id: string | null;
          started_by_name: string | null;
          approved_by_name: string | null;
        }
      | undefined;

    const progress = session ? sessionProgress(session.id) : null;

    const contributors = session ? contributorsForSession(session.id) : [];
    if (
      session?.started_by_id &&
      session.started_by_name &&
      !contributors.some((c) => c.id === session.started_by_id)
    ) {
      contributors.unshift({
        id: session.started_by_id,
        name: session.started_by_name,
      });
    }

    return {
      ...t,
      canComplete,
      sessionId: session?.id ?? null,
      status: session?.status ?? "not_started",
      progress,
      contributors,
      startedByName: session?.started_by_name ?? null,
      approvedByName: session?.approved_by_name ?? null,
      submittedAt: session?.submitted_at ?? null,
      approvedAt: session?.approved_at ?? null,
      conferenceId: null as number | null,
      conferenceName: null as string | null,
      conferenceStatus: null as string | null,
      conferenceStartDate: null as string | null,
      conferenceEndDate: null as string | null,
    };
  });

  // Conference-linked sessions: append one card per active session so the
  // pre-conference / conference-it work shows up alongside daily checklists.
  // Only show non-approved sessions to avoid cluttering the list once a
  // conference is complete.
  const conferenceSessions = db
    .prepare(
      `SELECT cs.id, cs.status, cs.submitted_at, cs.approved_at,
              cs.checklist_type_slug AS slug,
              cs.started_by_user_id AS started_by_id,
              starter.${nameCol} AS started_by_name,
              approver.${nameCol} AS approved_by_name,
              t.label, t.frequency, t.icon, t.completer_role, t.approver_role,
              c.id AS conference_id, c.name AS conference_name,
              c.status AS conference_status,
              c.start_date AS conference_start_date,
              c.end_date AS conference_end_date
       FROM checklist_sessions cs
       JOIN conferences c ON c.id = cs.conference_id
       JOIN checklist_types t ON t.slug = cs.checklist_type_slug
       LEFT JOIN users starter ON starter.id = cs.started_by_user_id
       LEFT JOIN users approver ON approver.id = cs.approved_by_user_id
       WHERE cs.conference_id IS NOT NULL
         AND cs.id IS NOT NULL
         AND cs.status != 'approved'
         AND t.is_active = 1
         AND c.status IN ('Planning', 'Active')
       ORDER BY c.start_date,
         CASE t.slug
           WHEN 'operational' THEN 1
           WHEN 'facility' THEN 2
           WHEN 'kitchen' THEN 3
           WHEN 'cyberbar' THEN 4
           WHEN 'frontdesk' THEN 5
           WHEN 'pre-conference' THEN 6
           WHEN 'conference-it' THEN 7
           ELSE 50 + t.display_order
         END`,
    )
    .all() as Array<{
    id: number | string;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
    slug: string;
    started_by_id: string | null;
    started_by_name: string | null;
    approved_by_name: string | null;
    label: string;
    frequency: string;
    icon: string;
    completer_role: string;
    approver_role: string;
    conference_id: number;
    conference_name: string;
    conference_status: string;
    conference_start_date: string;
    conference_end_date: string;
  }>;

  for (const cs of conferenceSessions) {
    const contributors = contributorsForSession(cs.id);
    if (
      cs.started_by_id &&
      cs.started_by_name &&
      !contributors.some((c) => c.id === cs.started_by_id)
    ) {
      contributors.unshift({ id: cs.started_by_id, name: cs.started_by_name });
    }
    result.push({
      slug: cs.slug,
      label: cs.label,
      icon: cs.icon,
      frequency: cs.frequency,
      completer_role: cs.completer_role,
      approver_role: cs.approver_role,
      canComplete: canCompleteChecklist(db, cs.slug, user),
      sessionId: cs.id,
      status: cs.status,
      progress: sessionProgress(cs.id),
      contributors,
      startedByName: cs.started_by_name,
      approvedByName: cs.approved_by_name,
      submittedAt: cs.submitted_at,
      approvedAt: cs.approved_at,
      conferenceId: cs.conference_id,
      conferenceName: cs.conference_name,
      conferenceStatus: cs.conference_status,
      conferenceStartDate: cs.conference_start_date,
      conferenceEndDate: cs.conference_end_date,
    });
  }

  return NextResponse.json({ date, today, isToday, checklists: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, conferenceId } = (await req.json()) as {
    slug?: string;
    conferenceId?: number;
  };
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const normalizedSlug = normalizeChecklistSlug(slug);
  const db = getDb();

  if (!canCompleteChecklist(db, normalizedSlug, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const date = todayDate();
  const existing = db
    .prepare(
      `SELECT id, status FROM checklist_sessions
       WHERE checklist_type_slug = ? AND date = ?
       AND COALESCE(conference_id, -1) = COALESCE(?, -1) AND id IS NOT NULL`,
    )
    .get(normalizedSlug, date, conferenceId ?? null) as
    | { id: string; status: string }
    | undefined;

  const session = getOrCreateSession(
    normalizedSlug,
    user.id,
    date,
    conferenceId ?? null,
  );

  // Opening creates/loads a not_started session — do not treat that as "started".
  if (!existing) {
    logAudit(user.id, "checklist_opened", "session", String(session.id));
  }

  return NextResponse.json({ session });
}
