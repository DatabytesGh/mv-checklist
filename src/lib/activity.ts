import { randomUUID } from "crypto";
import { activityBus } from "./activity-bus";
import type { ActivityEvent, ActivityType } from "./activity-types";
import { getDb } from "./db";
import { resolveChecklistType, sessionProgress } from "./checklists";

export function getChecklistMeta(sessionId: string) {
  const db = getDb();
  const session = db
    .prepare("SELECT checklist_type_slug FROM checklist_sessions WHERE id = ?")
    .get(sessionId) as { checklist_type_slug: string } | undefined;
  if (!session) return undefined;
  const type = resolveChecklistType(db, session.checklist_type_slug);
  if (!type) return undefined;
  return { slug: type.slug, label: type.label };
}

export function publishActivity(
  partial: Omit<ActivityEvent, "id" | "timestamp">,
): ActivityEvent {
  const event: ActivityEvent = {
    ...partial,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  activityBus.publish(event);
  return event;
}

export function publishChecklistItemUpdate(opts: {
  sessionId: string;
  actorUserId: string;
  actorName: string;
  itemStatus: string;
}) {
  const meta = getChecklistMeta(opts.sessionId);
  return publishActivity({
    type: "checklist.item_updated",
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    entityType: "item",
    entityId: opts.sessionId,
    sessionId: opts.sessionId,
    checklistSlug: meta?.slug,
    checklistLabel: meta?.label,
    itemStatus: opts.itemStatus,
    progress: sessionProgress(opts.sessionId),
  });
}

export function publishSessionActivity(
  type: Extract<
    ActivityType,
    | "checklist.session_started"
    | "checklist.submitted"
    | "checklist.approved"
    | "checklist.rejected"
  >,
  opts: {
    sessionId: string;
    actorUserId: string;
    actorName: string;
    status?: string;
  },
) {
  const meta = getChecklistMeta(opts.sessionId);
  return publishActivity({
    type,
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    entityType: "session",
    entityId: opts.sessionId,
    sessionId: opts.sessionId,
    checklistSlug: meta?.slug,
    checklistLabel: meta?.label,
    status: opts.status,
    progress: sessionProgress(opts.sessionId),
  });
}

export function publishFaultActivity(
  type: Extract<ActivityType, "fault.reported" | "fault.resolved">,
  opts: {
    faultId: string;
    sessionId: string;
    actorUserId: string;
    actorName: string;
    title: string;
  },
) {
  // Standalone (ad-hoc) faults have no linked checklist session, so skip
  // the checklist metadata lookup rather than triggering a spurious query.
  const meta = opts.sessionId ? getChecklistMeta(opts.sessionId) : undefined;
  return publishActivity({
    type,
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    entityType: "fault",
    entityId: opts.faultId,
    sessionId: opts.sessionId,
    checklistSlug: meta?.slug,
    checklistLabel: meta?.label,
    title: opts.title,
  });
}
