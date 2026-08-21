import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sessionProgress } from "@/lib/checklists";
import { listActiveUsersByRole } from "@/lib/user-queries";
import { usesInventoryUserSchema } from "@/lib/users-db";
import { archivePastConferences, localCalendarDate } from "@/lib/conferences";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  archivePastConferences(db);
  const conference = db
    .prepare("SELECT * FROM conferences WHERE id = ?")
    .get(Number(id)) as
    | {
        id: number;
        name: string;
        status: string;
        start_date: string;
        end_date: string;
      }
    | undefined;
  if (!conference) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nameCol = usesInventoryUserSchema(db) ? "full_name" : "display_name";

  const sessions = db
    .prepare(
      `SELECT s.*, t.label, t.frequency, t.completer_role,
              starter.${nameCol} AS started_by_name,
              approver.${nameCol} AS approved_by_name
       FROM checklist_sessions s
       JOIN checklist_types t ON t.slug = s.checklist_type_slug
       LEFT JOIN users starter ON starter.id = s.started_by_user_id
       LEFT JOIN users approver ON approver.id = s.approved_by_user_id
       WHERE s.conference_id = ?
       ORDER BY
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
    .all(Number(id)) as Array<{
    id: number | string;
    status: string;
    label: string;
    completer_role: string;
    submitted_at: string | null;
    approved_at: string | null;
    started_by_name: string | null;
    approved_by_name: string | null;
  }>;

  const contributorsForSession = (sessionId: string | number) =>
    db
      .prepare(
        `SELECT DISTINCT u.id AS id, u.${nameCol} AS display_name, u.username
         FROM checklist_item_responses r
         JOIN users u ON u.id = r.checked_by_user_id
         WHERE r.session_id = ? AND r.checked_by_user_id IS NOT NULL
         ORDER BY u.${nameCol}`,
      )
      .all(sessionId) as Array<{
      id: string;
      display_name: string;
      username: string;
    }>;

  // For each session, look up who is responsible (users with the completer
  // role) so the conference page can display "Assigned to: X, Y".
  const teamsByRole = new Map<
    string,
    Array<{ id: string; display_name: string; username: string }>
  >();
  const withProgress = sessions.map((s) => {
    if (!teamsByRole.has(s.completer_role)) {
      teamsByRole.set(
        s.completer_role,
        listActiveUsersByRole(db, s.completer_role) as Array<{
          id: string;
          display_name: string;
          username: string;
        }>,
      );
    }
    return {
      ...s,
      progress: sessionProgress(s.id),
      assignees: teamsByRole.get(s.completer_role) ?? [],
      contributors: contributorsForSession(s.id),
    };
  });

  const hotelWhatsapp =
    (
      db
        .prepare("SELECT value FROM settings WHERE key = 'hotel_whatsapp'")
        .get() as { value: string } | undefined
    )?.value?.trim() || null;

  const sessionIds = sessions.map((s) => String(s.id));
  const labelBySession = new Map(
    sessions.map((s) => [String(s.id), s.label] as const),
  );

  const activity: Array<{
    action: string;
    details: string | null;
    created_at: string;
    actor_name: string;
    checklist_label: string | null;
  }> = [];

  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT a.action, a.details, a.created_at, a.entity_type, a.entity_id,
                COALESCE(u.${nameCol}, u.username, 'System') AS actor_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE (a.entity_type = 'conference' AND a.entity_id = ?)
             OR (a.entity_type = 'session' AND a.entity_id IN (${placeholders}))
          ORDER BY a.created_at DESC
          LIMIT 80`,
      )
      .all(String(id), ...sessionIds) as Array<{
      action: string;
      details: string | null;
      created_at: string;
      entity_type: string | null;
      entity_id: string | null;
      actor_name: string;
    }>;
    for (const row of rows) {
      activity.push({
        action: row.action,
        details: row.details,
        created_at: row.created_at,
        actor_name: row.actor_name,
        checklist_label:
          row.entity_type === "session" && row.entity_id
            ? (labelBySession.get(String(row.entity_id)) ?? null)
            : null,
      });
    }
  } else {
    const rows = db
      .prepare(
        `SELECT a.action, a.details, a.created_at,
                COALESCE(u.${nameCol}, u.username, 'System') AS actor_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.entity_type = 'conference' AND a.entity_id = ?
          ORDER BY a.created_at DESC
          LIMIT 80`,
      )
      .all(String(id)) as Array<{
      action: string;
      details: string | null;
      created_at: string;
      actor_name: string;
    }>;
    for (const row of rows) {
      activity.push({
        action: row.action,
        details: row.details,
        created_at: row.created_at,
        actor_name: row.actor_name,
        checklist_label: null,
      });
    }
  }

  const past = conference.end_date < localCalendarDate();

  return NextResponse.json({
    conference,
    sessions: withProgress,
    hotelWhatsapp,
    activity,
    past,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const existing = db
    .prepare("SELECT id, name FROM conferences WHERE id = ?")
    .get(Number(id)) as { id: number; name: string } | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.status) {
    const sessions = db
      .prepare(
        `SELECT id, status FROM checklist_sessions WHERE conference_id = ?`,
      )
      .all(Number(id)) as { status: string }[];

    if (body.status === "Active") {
      const allApproved = sessions.every((s) => s.status === "approved");
      if (sessions.length > 0 && !allApproved) {
        return NextResponse.json(
          { error: "All conference checklists must be approved first" },
          { status: 400 },
        );
      }
    }

    db.prepare(`UPDATE conferences SET status = ? WHERE id = ?`).run(
      body.status,
      Number(id),
    );
    logAudit(user.id, "conference_status_changed", "conference", String(id), body.status);
  }

  // Field edits — admin only. `initiateConference` can create/activate, but
  // only admins can rename/reschedule after creation to avoid inconsistency.
  const editableFields = [
    "name",
    "start_date",
    "end_date",
    "guest_count",
    "coordinator_name",
    "coordinator_phone",
    "notes",
  ] as const;
  const editing = editableFields.some((f) => body[f] !== undefined);
  if (editing) {
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const name = body.name?.trim();
    if (body.name !== undefined && !name) {
      return NextResponse.json(
        { error: "Conference name cannot be empty" },
        { status: 400 },
      );
    }
    if (body.start_date && body.end_date && body.start_date > body.end_date) {
      return NextResponse.json(
        { error: "Start date must be on or before end date" },
        { status: 400 },
      );
    }

    const updates: string[] = [];
    const values: Array<string | number | null> = [];
    const push = (col: string, val: string | number | null) => {
      updates.push(`${col} = ?`);
      values.push(val);
    };
    if (body.name !== undefined) push("name", name!);
    if (body.start_date !== undefined) push("start_date", body.start_date);
    if (body.end_date !== undefined) push("end_date", body.end_date);
    if (body.guest_count !== undefined)
      push(
        "guest_count",
        body.guest_count === "" || body.guest_count == null
          ? null
          : Number(body.guest_count),
      );
    if (body.coordinator_name !== undefined)
      push("coordinator_name", body.coordinator_name?.trim() || null);
    if (body.coordinator_phone !== undefined)
      push("coordinator_phone", body.coordinator_phone?.trim() || null);
    if (body.notes !== undefined) push("notes", body.notes ?? null);

    if (updates.length > 0) {
      try {
        const tx = db.transaction(() => {
          values.push(Number(id));
          db.prepare(
            `UPDATE conferences SET ${updates.join(", ")} WHERE id = ?`,
          ).run(...values);

          // Keep linked sessions in sync with the conference's start_date so
          // dashboard/date filters keep showing them under the right day.
          if (body.start_date !== undefined) {
            db.prepare(
              `UPDATE checklist_sessions SET date = ? WHERE conference_id = ?`,
            ).run(body.start_date, Number(id));
          }
        });
        tx();
      } catch (err) {
        console.error("[api/conferences/[id]] edit failed", err);
        return NextResponse.json(
          { error: "Could not update conference" },
          { status: 500 },
        );
      }

      logAudit(
        user.id,
        "conference_updated",
        "conference",
        String(id),
        name ?? existing.name,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const conference = db
    .prepare("SELECT id, name FROM conferences WHERE id = ?")
    .get(Number(id)) as { id: number; name: string } | undefined;
  if (!conference) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const tx = db.transaction(() => {
      const sessionIds = (
        db
          .prepare(
            "SELECT id FROM checklist_sessions WHERE conference_id = ?",
          )
          .all(Number(id)) as Array<{ id: string | number }>
      ).map((s) => s.id);

      if (sessionIds.length > 0) {
        const placeholders = sessionIds.map(() => "?").join(",");
        // Preserve fault history — a broken tap logged during a conference
        // is still a real issue after the conference is gone. Detach the
        // fault from the session/response instead of deleting it.
        db.prepare(
          `UPDATE fault_reports
             SET session_id = NULL, item_response_id = NULL
             WHERE session_id IN (${placeholders})`,
        ).run(...sessionIds);
        db.prepare(
          `DELETE FROM checklist_item_responses WHERE session_id IN (${placeholders})`,
        ).run(...sessionIds);
        db.prepare(
          `DELETE FROM checklist_sessions WHERE id IN (${placeholders})`,
        ).run(...sessionIds);
      }

      db.prepare("DELETE FROM conferences WHERE id = ?").run(Number(id));
    });
    tx();
  } catch (err) {
    console.error("[api/conferences/[id]] delete failed", err);
    return NextResponse.json(
      { error: "Could not delete conference" },
      { status: 500 },
    );
  }

  logAudit(user.id, "conference_deleted", "conference", String(id), conference.name);
  return NextResponse.json({ ok: true });
}
