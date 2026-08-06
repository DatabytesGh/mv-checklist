export type ChecklistRole =
  | "admin"
  | "frontdesk"
  | "housekeeping"
  | "kitchen"
  | "cyberbar"
  | "it_staff"
  | "manager";

export type SessionStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export type ItemStatus =
  | "pending"
  | "checked"
  | "faulty"
  | "na"
  | "not_done";

export type FaultSeverity = "low" | "medium" | "high" | "critical";
export type FaultStatus =
  | "open"
  | "reported"
  | "in_progress"
  | "resolved"
  | "closed";

export type ConferenceStatus =
  | "Planning"
  | "Active"
  | "Completed"
  | "Cancelled";

export interface ChecklistPermissions {
  completeFacilityChecklist: boolean;
  completeHousekeepingChecklist: boolean;
  completeKitchenChecklist: boolean;
  completeCyberBarChecklist: boolean;
  completeLaundryChecklist: boolean;
  completePreConferenceChecklist: boolean;
  completeConferenceITChecklist: boolean;
  completeFrontDeskChecklist: boolean;
  approveChecklist: boolean;
  initiateConference: boolean;
  viewDashboard: boolean;
  viewReports: boolean;
  manageVendors: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
  viewAuditLog: boolean;
  reportFault: boolean;
  resolveFault: boolean;
  deleteChecklistItem: boolean;
  /** Receive WhatsApp alerts when checklists start / are submitted. */
  receiveNotifications: boolean;
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: ChecklistRole;
  display_name?: string;
  phone?: string;
  active: boolean;
  checklist_only: boolean;
  inventory_user_id?: string;
}

export interface ChecklistType {
  id: number;
  slug: string;
  label: string;
  icon: string;
  department_tag: string;
  frequency: string;
  completer_role: ChecklistRole;
  approver_role: ChecklistRole;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
}

export interface ChecklistTemplate {
  id: number;
  checklist_type_slug: string;
  section: string;
  item_order: number;
  item_text: string;
  requires_time_entry: boolean;
  requires_text_entry: boolean;
  is_shift_leader_selector: boolean;
  is_active: boolean;
}

export interface ChecklistSession {
  id: number | string;
  checklist_type_slug: string;
  date: string;
  conference_id: number | null;
  status: SessionStatus;
  started_by_user_id: string | null;
  submitted_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

export interface ChecklistItemResponse {
  id: number;
  session_id: number;
  template_item_id: number;
  status: ItemStatus;
  text_value: string | null;
  time_value: string | null;
  checked_by_user_id: string | null;
  checked_at: string | null;
}

export interface Vendor {
  id: number;
  name: string;
  type: string;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  specialization: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Conference {
  id: number;
  name: string;
  institution: string | null;
  guest_count: number | null;
  conference_type: string | null;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: ConferenceStatus;
  created_by_user_id: string | null;
  created_at: string;
}

export interface FaultReport {
  id: number;
  session_id: number;
  item_response_id: number | null;
  title: string;
  description: string;
  location: string | null;
  severity: FaultSeverity;
  vendor_id: number | null;
  status: FaultStatus;
  reported_by_user_id: string;
  reported_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  whatsapp_sent: boolean;
  whatsapp_sent_at: string | null;
  resolution_notes: string | null;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface SessionUser {
  id: string;
  username: string;
  role: ChecklistRole;
  display_name?: string;
  phone?: string;
  permissions: ChecklistPermissions;
  /** When true, the user must set a new password before using the app. */
  must_change_password?: boolean;
}
