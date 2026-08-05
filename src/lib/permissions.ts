import type { ChecklistPermissions, ChecklistRole, SessionUser } from "./types";
import type Database from "better-sqlite3";
import { normalizeChecklistSlug } from "./checklist-slugs";

export const PERMISSION_KEYS: (keyof ChecklistPermissions)[] = [
  "completeFacilityChecklist",
  "completeHousekeepingChecklist",
  "completeKitchenChecklist",
  "completeCyberBarChecklist",
  "completeLaundryChecklist",
  "completePreConferenceChecklist",
  "completeConferenceITChecklist",
  "completeFrontDeskChecklist",
  "approveChecklist",
  "initiateConference",
  "viewDashboard",
  "viewReports",
  "manageVendors",
  "manageUsers",
  "manageSettings",
  "viewAuditLog",
  "reportFault",
  "resolveFault",
  "deleteChecklistItem",
  "receiveNotifications",
];

const ALL_TRUE = {
  completeFacilityChecklist: true,
  completeHousekeepingChecklist: true,
  completeKitchenChecklist: true,
  completeCyberBarChecklist: true,
  completeLaundryChecklist: true,
  completePreConferenceChecklist: true,
  completeConferenceITChecklist: true,
  completeFrontDeskChecklist: true,
  approveChecklist: true,
  initiateConference: true,
  viewDashboard: true,
  viewReports: true,
  manageVendors: true,
  manageUsers: true,
  manageSettings: true,
  viewAuditLog: true,
  reportFault: true,
  resolveFault: true,
  deleteChecklistItem: true,
  receiveNotifications: true,
} satisfies ChecklistPermissions;

export const DEFAULT_ROLE_PERMISSIONS: Record<ChecklistRole, ChecklistPermissions> =
  {
    // Admins manage the system; checklist WhatsApp alerts default to Front Desk only.
    admin: { ...ALL_TRUE, receiveNotifications: false },
    frontdesk: {
      completeFacilityChecklist: false,
      completeHousekeepingChecklist: false,
      completeKitchenChecklist: false,
      completeCyberBarChecklist: false,
      completeLaundryChecklist: false,
      completePreConferenceChecklist: true,
      completeConferenceITChecklist: false,
      completeFrontDeskChecklist: true,
      approveChecklist: true,
      initiateConference: true,
      viewDashboard: true,
      viewReports: true,
      manageVendors: true,
      manageUsers: true,
      manageSettings: true,
      viewAuditLog: true,
      reportFault: true,
      resolveFault: true,
      deleteChecklistItem: false,
      receiveNotifications: true,
    },
    manager: {
      completeFacilityChecklist: false,
      completeHousekeepingChecklist: false,
      completeKitchenChecklist: false,
      completeCyberBarChecklist: false,
      completeLaundryChecklist: false,
      completePreConferenceChecklist: false,
      completeConferenceITChecklist: false,
      completeFrontDeskChecklist: false,
      approveChecklist: true,
      initiateConference: false,
      viewDashboard: true,
      viewReports: true,
      manageVendors: false,
      manageUsers: false,
      manageSettings: false,
      viewAuditLog: true,
      reportFault: true,
      resolveFault: true,
      deleteChecklistItem: false,
      receiveNotifications: true,
    },
    housekeeping: {
      completeFacilityChecklist: true,
      completeHousekeepingChecklist: true,
      completeKitchenChecklist: false,
      completeCyberBarChecklist: false,
      completeLaundryChecklist: true,
      completePreConferenceChecklist: false,
      completeConferenceITChecklist: false,
      completeFrontDeskChecklist: false,
      approveChecklist: false,
      initiateConference: false,
      viewDashboard: true,
      viewReports: false,
      manageVendors: false,
      manageUsers: false,
      manageSettings: false,
      viewAuditLog: false,
      reportFault: true,
      resolveFault: false,
      deleteChecklistItem: false,
      receiveNotifications: false,
    },
    kitchen: {
      completeFacilityChecklist: false,
      completeHousekeepingChecklist: false,
      completeKitchenChecklist: true,
      completeCyberBarChecklist: false,
      completeLaundryChecklist: false,
      completePreConferenceChecklist: false,
      completeConferenceITChecklist: false,
      completeFrontDeskChecklist: false,
      approveChecklist: false,
      initiateConference: false,
      viewDashboard: true,
      viewReports: false,
      manageVendors: false,
      manageUsers: false,
      manageSettings: false,
      viewAuditLog: false,
      reportFault: true,
      resolveFault: false,
      deleteChecklistItem: false,
      receiveNotifications: false,
    },
    cyberbar: {
      completeFacilityChecklist: false,
      completeHousekeepingChecklist: false,
      completeKitchenChecklist: false,
      completeCyberBarChecklist: true,
      completeLaundryChecklist: false,
      completePreConferenceChecklist: false,
      completeConferenceITChecklist: false,
      completeFrontDeskChecklist: false,
      approveChecklist: false,
      initiateConference: false,
      viewDashboard: true,
      viewReports: false,
      manageVendors: false,
      manageUsers: false,
      manageSettings: false,
      viewAuditLog: false,
      reportFault: true,
      resolveFault: false,
      deleteChecklistItem: false,
      receiveNotifications: false,
    },
    it_staff: {
      completeFacilityChecklist: false,
      completeHousekeepingChecklist: false,
      completeKitchenChecklist: false,
      completeCyberBarChecklist: false,
      completeLaundryChecklist: false,
      completePreConferenceChecklist: false,
      completeConferenceITChecklist: true,
      completeFrontDeskChecklist: false,
      approveChecklist: false,
      initiateConference: false,
      viewDashboard: true,
      viewReports: false,
      manageVendors: false,
      manageUsers: false,
      manageSettings: false,
      viewAuditLog: false,
      reportFault: true,
      resolveFault: false,
      deleteChecklistItem: false,
      receiveNotifications: false,
    },
  };

export function permissionForChecklist(
  slug: string,
  perms: ChecklistPermissions,
): boolean {
  const map: Record<string, keyof ChecklistPermissions> = {
    facility: "completeFacilityChecklist",
    housekeeping: "completeHousekeepingChecklist",
    kitchen: "completeKitchenChecklist",
    cyberbar: "completeCyberBarChecklist",
    laundry: "completeLaundryChecklist",
    "pre-conference": "completePreConferenceChecklist",
    operational: "completePreConferenceChecklist",
    "conference-it": "completeConferenceITChecklist",
    conference_it: "completeConferenceITChecklist",
    frontdesk: "completeFrontDeskChecklist",
  };
  const key = map[slug] ?? map[slug.replace(/_/g, "-")];
  if (!key) return false;
  return perms[key];
}

/** Built-in slugs use permission flags; custom types fall back to completer_role match. */
export function canCompleteChecklist(
  db: Database.Database,
  slug: string,
  user: SessionUser,
): boolean {
  if (isAdmin(user.role)) return true;
  const normalized = normalizeChecklistSlug(slug);
  if (permissionForChecklist(normalized, user.permissions)) return true;
  const type = db
    .prepare("SELECT completer_role FROM checklist_types WHERE slug = ? AND is_active = 1")
    .get(normalized) as { completer_role: ChecklistRole } | undefined;
  return type?.completer_role === user.role;
}

export function isAdmin(role: ChecklistRole): boolean {
  return role === "admin";
}
