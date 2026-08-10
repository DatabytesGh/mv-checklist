import { NextRequest, NextResponse, after } from "next/server";
import { publishChecklistItemUpdate, publishSessionActivity } from "@/lib/activity";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canCompleteChecklist } from "@/lib/permissions";
import {
  markSessionInProgress,
  reopenSubmittedSession,
  resolveChecklistType,
} from "@/lib/checklists";
import { newResponseId, tableIdIsText } from "@/lib/sessions-db";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";
import { notifyChecklistStartedToRecipients } from "@/lib/whatsapp-notify";

const PROGRESS_STATUSES = new Set(["checked", "faulty", "na", "not_done"]);

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    sessionId,
    templateItemId,
    status,
    textValue,
    timeValue,
  } = body as {
    sessionId?: string | number;
    templateItemId?: string | number;
    status?: string;
    textValue?: string;
    timeValue?: string;
  };

  const sid = sessionId != null ? String(sessionId) : "";
  const tid = templateItemId != null ? String(templateItemId) : "";

  if (!sid || sid === "null" || !tid || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const session = db
    .prepare(
      "SELECT checklist_type_slug, status, date FROM checklist_sessions WHERE id = ?",
    )
    .get(sid) as
    | { checklist_type_slug: string; status: string; date: string }
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Approved checklists stay locked. Submitted ones can still be edited —
  // changing an item reopens them for re-submit (see below).
  if (session.status === "approved") {
    return NextResponse.json({ error: "Checklist is read-only" }, { status: 403 });
  }

  if (!canCompleteChecklist(db, session.checklist_type_slug, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const priorProgress = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM checklist_item_responses
         WHERE session_id = ? AND status IN ('checked', 'faulty', 'na', 'not_done')`,
      )
      .get(sid) as { c: number }
  ).c;

  const existingItem = db
    .prepare(
      `SELECT status FROM checklist_item_responses
       WHERE session_id = ? AND template_item_id = ?`,
    )
    .get(sid, tid) as { status: string } | undefined;
  const itemAlreadyProgress = Boolean(
    existingItem && PROGRESS_STATUSES.has(existingItem.status),
  );

  const result = db
    .prepare(
      `UPDATE checklist_item_responses
       SET status = ?, text_value = ?, time_value = ?, checked_by_user_id = ?, checked_at = datetime('now')
       WHERE session_id = ? AND template_item_id = ?`,
    )
    .run(
      status,
      textValue ?? null,
      timeValue ?? null,
      user.id,
      sid,
      tid,
    );

  if (result.changes === 0) {
    if (tableIdIsText(db, "checklist_item_responses")) {
      db.prepare(
        `INSERT INTO checklist_item_responses (id, session_id, template_item_id, status, text_value, time_value, checked_by_user_id, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).run(
        newResponseId(),
        sid,
        tid,
        status,
        textValue ?? null,
        timeValue ?? null,
        user.id,
      );
    } else {
      db.prepare(
        `INSERT INTO checklist_item_responses (session_id, template_item_id, status, text_value, time_value, checked_by_user_id, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).run(sid, tid, status, textValue ?? null, timeValue ?? null, user.id);
    }
  }

  publishChecklistItemUpdate({
    sessionId: sid,
    actorUserId: user.id,
    actorName: user.display_name ?? user.username,
    itemStatus: status,
  });

  // Editing after submit pulls the checklist back to in_progress so staff
  // must submit again (approval shouldn't review a stale snapshot).
  if (session.status === "submitted") {
    if (reopenSubmittedSession(sid, db)) {
      logAudit(user.id, "checklist_reopened", "session", sid, "edited after submit");
    }
  }

  // First real work on this checklist → mark in progress + notify recipients.
  const isFirstProgress =
    PROGRESS_STATUSES.has(status) &&
    priorProgress === 0 &&
    !itemAlreadyProgress;

  if (isFirstProgress) {
    const becameInProgress = markSessionInProgress(sid, user.id, db);
    if (becameInProgress) {
      logAudit(user.id, "checklist_started", "session", sid);
      publishSessionActivity("checklist.session_started", {
        sessionId: sid,
        actorUserId: user.id,
        actorName: user.display_name ?? user.username,
        status: "in_progress",
      });
    }

    if (getWhatsAppConfigStatus().configured) {
      const typeRow = resolveChecklistType(db, session.checklist_type_slug);
      const payload = {
        checklistSlug: typeRow?.slug ?? session.checklist_type_slug,
        checklistLabel: typeRow?.label ?? session.checklist_type_slug,
        date: session.date,
        starterName: user.display_name ?? user.username,
      };
      after(async () => {
        const results = await notifyChecklistStartedToRecipients(db, payload);
        for (const result of results) {
          if (!result.ok) {
            console.warn(
              "[whatsapp] first-item notify failed:",
              result.errorCode ?? "",
              result.errorMessage ?? "unknown",
            );
          } else {
            console.info("[whatsapp] first-item notify ok:", result.messageId);
          }
        }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
