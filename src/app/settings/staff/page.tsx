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
import { Plus, Pencil } from "lucide-react";
import { useToast } from "@/providers/toast-provider";

type Staff = {
  id: number;
  name: string;
  is_active: number;
  display_order: number;
};

const EMPTY = { name: "", is_active: true };

export default function SettingsStaffPage() {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      apiFetch("/api/staff")
        .then((r) => r.json())
        .then((d) => setStaff(d.staff ?? [])),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setModalOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditingId(s.id);
    setForm({ name: s.name, is_active: !!s.is_active });
    setModalOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = editingId
        ? await apiFetch("/api/staff", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...form }),
          })
        : await apiFetch("/api/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not save");
        return;
      }
      setModalOpen(false);
      toast.success(editingId ? "Staff updated" : "Staff added");
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="Staff"
        description="Names available when choosing a shift leader on checklists."
        action={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
          >
            Add staff
          </Button>
        }
        bodyClassName="p-0"
      >
        <List>
          {staff.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No staff yet.
            </p>
          )}
          {staff.map((s) => (
            <ListRow key={s.id} className={s.is_active ? "" : "opacity-60"}>
              <Avatar name={s.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {s.name}
                </p>
              </div>
              {!s.is_active && <Pill tone="red">Inactive</Pill>}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => openEdit(s)}
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
        title={editingId ? "Edit staff" : "Add staff"}
        description="This name will appear in shift leader pickers."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add staff"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name">
            <input
              className="input-field"
              placeholder="e.g. Mabel Agyabeng"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <div className="rounded-2xl border border-zinc-800/70 px-4">
            <ToggleRow
              label="Active"
              description="Inactive names are hidden from shift leader pickers"
              checked={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
