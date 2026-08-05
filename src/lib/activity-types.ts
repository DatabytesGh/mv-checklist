export type ActivityType =
  | "system.connected"
  | "checklist.item_updated"
  | "checklist.session_started"
  | "checklist.submitted"
  | "checklist.approved"
  | "checklist.rejected"
  | "fault.reported"
  | "fault.resolved";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  entityType: "session" | "item" | "fault";
  entityId: string;
  sessionId?: string;
  checklistSlug?: string;
  checklistLabel?: string;
  status?: string;
  itemStatus?: string;
  title?: string;
  progress?: {
    total: number;
    addressed: number;
    completed: number;
    pending: number;
    faulty: number;
    na?: number;
  };
}
