import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  conferenceChecklistSlugs,
  getOrCreateSession,
} from "@/lib/checklists";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const conferences = db
    .prepare(
      `SELECT * FROM conferences ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .all() as Array<{ id: number }>;

  // Roll up each conference's checklist state so the list can show a
  // "Checklists Completed" tick once every linked checklist is approved.
  const progressRows = db
    .prepare(
      `SELECT conference_id, status, COUNT(*) AS c
         FROM checklist_sessions
         WHERE conference_id IS NOT NULL
         GROUP BY conference_id, status`,
    )
    .all() as Array<{ conference_id: number; status: string; c: number }>;

  const progressByConf = new Map<
    number,
    {
      total: number;
      approved: number;
      submitted: number;
      inProgress: number;
    }
  >();
  for (const r of progressRows) {
    // Legacy rows may store conference_id as text ("1", "1.0") because the
    // column is TEXT-typed; coerce to number so the Map lookup below (keyed
    // by conferences.id, an integer) always hits.
    const key = Number(r.conference_id);
    if (!Number.isFinite(key)) continue;
    const p = progressByConf.get(key) ?? {
      total: 0,
      approved: 0,
      submitted: 0,
      inProgress: 0,
    };
    p.total += r.c;
    if (r.status === "approved") p.approved += r.c;
    else if (r.status === "submitted") p.submitted += r.c;
    else if (r.status === "in_progress") p.inProgress += r.c;
    progressByConf.set(key, p);
  }

  const withProgress = conferences.map((c) => ({
    ...c,
    checklistProgress: progressByConf.get(c.id) ?? {
      total: 0,
      approved: 0,
      submitted: 0,
      inProgress: 0,
    },
  }));

  return NextResponse.json({ conferences: withProgress });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.initiateConference) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name?.trim() || !body.start_date || !body.end_date) {
    return NextResponse.json(
      { error: "Name and dates are required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Wrap the insert + checklist spawn in a single transaction: if any of the
  // conference checklists fails to spawn, we rollback the conference row
  // too — otherwise a client retry would create duplicate conferences (the
  // original half-created one plus the retry).
  const spawnSlugs = conferenceChecklistSlugs(db);

  let conferenceId = 0;
  let spawned: Array<{ id: string | number; checklist_type_slug: string }> = [];
  try {
    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO conferences (name, institution, guest_count, conference_type, coordinator_name, coordinator_phone, start_date, end_date, notes, status, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Planning', ?)`,
        )
        .run(
          body.name.trim(),
          body.institution?.trim() || null,
          body.guest_count ?? null,
          body.conference_type ?? null,
          body.coordinator_name?.trim() || null,
          body.coordinator_phone?.trim() || null,
          body.start_date,
          body.end_date,
          body.notes ?? null,
          user.id,
        );
      conferenceId = Number(result.lastInsertRowid);
      spawned = spawnSlugs.map((slug) =>
        getOrCreateSession(slug, user.id, body.start_date, conferenceId, db),
      );
    });
    tx();
  } catch (err) {
    console.error("[api/conferences] create failed", err);
    return NextResponse.json(
      { error: "Could not create conference" },
      { status: 500 },
    );
  }

  logAudit(user.id, "conference_created", "conference", String(conferenceId), body.name.trim());

  return NextResponse.json({
    id: conferenceId,
    sessions: spawned.map((s) => ({
      id: s.id,
      slug: s.checklist_type_slug,
    })),
  });
}