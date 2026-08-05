"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SettingsSection,
  ToggleRow,
} from "@/components/settings/settings-ui";
import { apiFetch } from "@/lib/fetch";
import { roleLabel, cn } from "@/lib/utils";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { ChecklistPermissions, ChecklistRole } from "@/lib/types";

type RoleRow = { role: string; permissions_json: string };

const ROLES = [
  "admin",
  "frontdesk",
  "manager",
  "housekeeping",
  "kitchen",
  "cyberbar",
  "it_staff",
];

type PermKey = keyof ChecklistPermissions;

const GROUPS: Array<{
  title: string;
  description: string;
  keys: Array<{ key: PermKey; label: string }>;
}> = [
  {
    title: "Checklist completion",
    description: "Which checklists this role can fill out.",
    keys: [
      { key: "completeFacilityChecklist", label: "Facility / Security" },
      { key: "completeHousekeepingChecklist", label: "Housekeeping" },
      { key: "completeKitchenChecklist", label: "Kitchen" },
      { key: "completeCyberBarChecklist", label: "Cyber Bar" },
      { key: "completeLaundryChecklist", label: "Laundry" },
      { key: "completeFrontDeskChecklist", label: "Front Desk" },
      { key: "completePreConferenceChecklist", label: "Pre-conference" },
      { key: "completeConferenceITChecklist", label: "Conference IT" },
    ],
  },
  {
    title: "Approvals & conferences",
    description: "Reviewing submissions and running conferences.",
    keys: [
      { key: "approveChecklist", label: "Approve checklists" },
      { key: "initiateConference", label: "Initiate conferences" },
    ],
  },
  {
    title: "Faults",
    description: "Reporting and resolving maintenance issues.",
    keys: [
      { key: "reportFault", label: "Report faults" },
      { key: "resolveFault", label: "Resolve faults" },
    ],
  },
  {
    title: "Management",
    description: "Administrative capabilities.",
    keys: [
      { key: "manageUsers", label: "Manage members" },
      { key: "manageVendors", label: "Manage vendors" },
      { key: "manageSettings", label: "Manage settings" },
      { key: "deleteChecklistItem", label: "Delete checklist items" },
    ],
  },
  {
    title: "Notifications",
    description: "WhatsApp alerts when the first checklist item is checked/addressed, and when a checklist is submitted. Only roles with this on (and a WhatsApp number on the member) are notified — default is Front Desk only.",
    keys: [
      { key: "receiveNotifications", label: "Receive WhatsApp notifications" },
    ],
  },
  {
    title: "Visibility",
    description: "What this role can view.",
    keys: [
      { key: "viewDashboard", label: "Dashboard" },
      { key: "viewReports", label: "Reports" },
      { key: "viewAuditLog", label: "Audit log" },
    ],
  },
];

export default function SettingsRolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [activeRole, setActiveRole] = useState("frontdesk");
  const [perms, setPerms] = useState<ChecklistPermissions | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/users")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const row = roles.find((r) => r.role === activeRole);
    if (row) {
      try {
        const stored = JSON.parse(row.permissions_json) as Partial<ChecklistPermissions>;
        const defaults =
          DEFAULT_ROLE_PERMISSIONS[activeRole as ChecklistRole] ??
          DEFAULT_ROLE_PERMISSIONS.frontdesk;
        setPerms({ ...defaults, ...stored });
        setDirty(false);
      } catch {
        setPerms(null);
      }
    }
  }, [activeRole, roles]);

  const setKey = (key: PermKey, value: boolean) => {
    setPerms((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  };

  const save = async () => {
    if (!perms) return;
    setSaving(true);
    try {
      await apiFetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolePermissions: perms, role: activeRole }),
      });
      setDirty(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Roles & Permissions"
      description="Configure what each role can do, including who receives WhatsApp notifications."
      action={
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      }
      bodyClassName="space-y-5"
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRole(r)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeRole === r
                ? "border-accent-500/50 bg-accent-500/15 text-accent-300"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {roleLabel(r)}
          </button>
        ))}
      </div>

      {perms && (
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30"
            >
              <div className="border-b border-zinc-800/60 px-4 py-3">
                <p className="text-sm font-medium text-zinc-200">
                  {group.title}
                </p>
                <p className="text-[11px] text-zinc-500">{group.description}</p>
              </div>
              <div className="divide-y divide-zinc-800/50 px-4">
                {group.keys.map(({ key, label }) => (
                  <ToggleRow
                    key={key}
                    label={label}
                    checked={!!perms[key]}
                    onChange={(v) => setKey(key, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
