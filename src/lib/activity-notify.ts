import type { ActivityEvent } from "./activity-types";

export function activityNotificationCopy(event: ActivityEvent): {
  title: string;
  body: string;
} {
  const who = event.actorName;
  const checklist = event.checklistLabel ?? "Checklist";

  switch (event.type) {
    case "checklist.item_updated": {
      const prog = event.progress;
      const progText = prog
        ? `${prog.completed ?? prog.addressed}/${prog.total} done`
        : "";
      const status =
        event.itemStatus === "checked"
          ? "marked an item done"
          : event.itemStatus === "faulty"
            ? "flagged a fault"
            : event.itemStatus === "na"
              ? "marked N/A"
              : "updated an item";
      return {
        title: `${checklist} updated`,
        body: `${who} ${status}${progText ? ` · ${progText}` : ""}`,
      };
    }
    case "checklist.session_started":
      return { title: "Checklist started", body: `${who} started ${checklist}` };
    case "checklist.submitted":
      return {
        title: "Awaiting approval",
        body: `${who} submitted ${checklist} for approval`,
      };
    case "checklist.approved":
      return { title: "Checklist approved", body: `${who} approved ${checklist}` };
    case "checklist.rejected":
      return { title: "Checklist rejected", body: `${who} rejected ${checklist}` };
    case "fault.reported":
      return {
        title: "New fault reported",
        body: `${who}: ${event.title ?? "Fault"} (${checklist})`,
      };
    case "fault.resolved":
      return {
        title: "Fault resolved",
        body: `${who} resolved ${event.title ?? "fault"} (${checklist})`,
      };
    default:
      return { title: "Maya Villa Checklists", body: "Activity update" };
  }
}

export function shouldNotifyUser(
  event: ActivityEvent,
  viewer: { id: string; permissions: { approveChecklist?: boolean; viewReports?: boolean } },
): boolean {
  if (event.actorUserId === viewer.id) return false;
  return Boolean(viewer.permissions.approveChecklist || viewer.permissions.viewReports);
}
