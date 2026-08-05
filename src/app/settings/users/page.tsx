"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SettingsSection,
  List,
  ListRow,
  Field,
  Avatar,
  Pill,
  Modal,
  ToggleRow,
} from "@/components/settings/settings-ui";
import { apiFetch } from "@/lib/fetch";
import { roleLabel } from "@/lib/utils";
import type { ChecklistPermissions } from "@/lib/types";
import { UserPlus, Pencil, MessageCircle } from "lucide-react";

type UserRow = {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  active: number;
  checklist_only: number;
  phone?: string | null;
};

type RoleRow = {
  role: string;
  permissions_json: string;
};

const ROLES = [
  "admin",
  "frontdesk",
  "manager",
  "housekeeping",
  "kitchen",
  "cyberbar",
  "it_staff",
];

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "housekeeping",
  display_name: "",
  active: true,
  checklist_only: true,
  phone: "",
};

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleNotify, setRoleNotify] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        const map: Record<string, boolean> = {};
        for (const r of (d.roles ?? []) as RoleRow[]) {
          try {
            const p = JSON.parse(r.permissions_json) as ChecklistPermissions;
            map[r.role] = p.receiveNotifications === true;
          } catch {
            map[r.role] = false;
          }
        }
        setRoleNotify(map);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: "",
      role: u.role,
      display_name: u.display_name ?? u.username,
      active: !!u.active,
      checklist_only: !!u.checklist_only,
      phone: u.phone ?? "",
    });
    setModalOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
      } else {
        await apiFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="Members"
        description={`${users.length} ${users.length === 1 ? "person" : "people"} with access to this workspace. Set WhatsApp numbers here — roles with Receive WhatsApp notifications get checklist alerts.`}
        action={
          <Button
            size="sm"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={openCreate}
          >
            Add member
          </Button>
        }
        bodyClassName="p-0"
      >
        <List>
          {users.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No members yet.
            </p>
          )}
          {users.map((u) => (
            <ListRow key={u.id}>
              <Avatar name={u.display_name ?? u.username} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {u.display_name ?? u.username}
                </p>
                <p className="truncate text-xs text-zinc-500">@{u.username}</p>
                {u.phone?.trim() ? (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-400 sm:hidden">
                    <MessageCircle className="h-3 w-3 shrink-0" />
                    {u.phone.trim()}
                  </p>
                ) : null}
              </div>
              <div className="hidden min-w-[8.5rem] flex-col justify-center gap-0.5 text-xs md:flex">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {u.phone?.trim() || "No WhatsApp"}
                  </span>
                </span>
                {u.phone?.trim() && !roleNotify[u.role] ? (
                  <span className="truncate text-[10px] text-amber-400/90">
                    Role won&apos;t receive alerts
                  </span>
                ) : u.phone?.trim() && roleNotify[u.role] ? (
                  <span className="truncate text-[10px] text-accent-400/90">
                    Gets checklist alerts
                  </span>
                ) : null}
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Pill>{roleLabel(u.role)}</Pill>
                {u.checklist_only ? <Pill tone="sky">Checklist-only</Pill> : null}
              </div>
              <Pill tone={u.active ? "green" : "red"}>
                {u.active ? "Active" : "Inactive"}
              </Pill>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => openEdit(u)}
              >
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </ListRow>
          ))}
        </List>
      </SettingsSection>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit member" : "Add member"}
        description={
          editingId
            ? "Update this member's details and access."
            : "Create a new account for a staff member."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                saving ||
                (!editingId && (!form.username.trim() || !form.password.trim()))
              }
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create member"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Display name">
            <input
              className="input-field"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username">
              <input
                className="input-field"
                value={form.username}
                disabled={!!editingId}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field
              label={editingId ? "New password" : "Password"}
              hint={editingId ? "Leave blank to keep current" : undefined}
            >
              <input
                className="input-field"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <select
                className="input-field"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="WhatsApp number"
              hint={
                roleNotify[form.role]
                  ? "This role receives checklist WhatsApp alerts"
                  : "This role won’t get alerts until you enable Receive WhatsApp notifications in Settings → Roles"
              }
            >
              <input
                className="input-field"
                placeholder="0543843090 or +233…"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-zinc-800/70 px-4 divide-y divide-zinc-800/60">
            <ToggleRow
              label="Active"
              description="Can sign in and use the app"
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
            />
            <ToggleRow
              label="Checklist-only"
              description="Cannot access the inventory app"
              checked={form.checklist_only}
              onChange={(v) => setForm({ ...form, checklist_only: v })}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
