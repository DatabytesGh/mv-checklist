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

type Vendor = {
  id: number;
  name: string;
  type: string;
  phone: string | null;
  whatsapp_number: string | null;
  specialization: string | null;
  is_active: number;
};

const TYPES = [
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "ac_repairer", label: "AC Repair" },
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "other", label: "Other" },
];

const EMPTY = {
  name: "",
  type: "vendor",
  phone: "",
  whatsapp_number: "",
  specialization: "",
  is_active: true,
};

function typeLabel(t: string) {
  return TYPES.find((x) => x.value === t)?.label ?? t;
}

export default function SettingsVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      apiFetch("/api/vendors")
        .then((r) => r.json())
        .then((d) => setVendors(d.vendors ?? [])),
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

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      type: v.type,
      phone: v.phone ?? "",
      whatsapp_number: v.whatsapp_number ?? "",
      specialization: v.specialization ?? "",
      is_active: !!v.is_active,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch("/api/vendors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
      } else {
        await apiFetch("/api/vendors", {
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
        title="Vendors"
        description="Contractors and suppliers that receive fault notifications."
        action={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
          >
            Add vendor
          </Button>
        }
        bodyClassName="p-0"
      >
        <List>
          {vendors.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No vendors yet.
            </p>
          )}
          {vendors.map((v) => (
            <ListRow key={v.id} className={v.is_active ? "" : "opacity-60"}>
              <Avatar name={v.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {v.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {v.whatsapp_number ?? v.phone ?? "No contact number"}
                </p>
              </div>
              <Pill>{typeLabel(v.type)}</Pill>
              {!v.is_active && <Pill tone="red">Inactive</Pill>}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => openEdit(v)}
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
        title={editingId ? "Edit vendor" : "Add vendor"}
        description="Vendors can be notified via WhatsApp when faults are assigned."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add vendor"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Vendor name">
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <select
                className="input-field"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Specialization" hint="Optional">
              <input
                className="input-field"
                value={form.specialization}
                onChange={(e) =>
                  setForm({ ...form, specialization: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <input
                className="input-field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp number">
              <input
                className="input-field"
                placeholder="+233..."
                value={form.whatsapp_number}
                onChange={(e) =>
                  setForm({ ...form, whatsapp_number: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="rounded-2xl border border-zinc-800/70 px-4">
            <ToggleRow
              label="Active"
              description="Inactive vendors won't receive notifications"
              checked={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
