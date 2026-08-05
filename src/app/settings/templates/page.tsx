"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SettingsSection,
  List,
  ListRow,
  Field,
  Pill,
  Modal,
  Switch,
  ToggleRow,
  ConfirmDialog,
} from "@/components/settings/settings-ui";
import { apiFetch } from "@/lib/fetch";
import { roleLabel, cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Pencil, Plus, Trash2 } from "lucide-react";

type ChecklistType = {
  slug: string;
  label: string;
  frequency: string;
  completer_role: string;
  approver_role: string;
  is_system: number;
};

type TemplateItem = {
  id: number | string;
  checklist_type_slug?: string;
  section: string;
  item_text: string;
  requires_time_entry: number;
  requires_text_entry: number;
  is_shift_leader_selector: number;
  is_active: number;
};

type ItemForm = {
  checklist_type_slug: string;
  section: string;
  item_text: string;
  requires_time_entry: boolean;
  requires_text_entry: boolean;
  is_shift_leader_selector: boolean;
  is_active: boolean;
};

const ROLES = ["admin", "frontdesk", "manager", "housekeeping", "kitchen", "cyberbar", "it_staff"];

const EMPTY_TYPE = {
  label: "",
  slug: "",
  frequency: "daily",
  completer_role: "housekeeping",
  approver_role: "frontdesk",
  department_tag: "",
};

const EMPTY_ITEM: ItemForm = {
  checklist_type_slug: "",
  section: "General",
  item_text: "",
  requires_time_entry: false,
  requires_text_entry: false,
  is_shift_leader_selector: false,
  is_active: true,
};

export default function SettingsTemplatesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canDelete = user?.role === "admin" || !!user?.permissions.deleteChecklistItem;
  const [types, setTypes] = useState<ChecklistType[]>([]);
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [typeModal, setTypeModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | string | null>(
    null,
  );
  const [typeForm, setTypeForm] = useState({ ...EMPTY_TYPE });
  const [itemForm, setItemForm] = useState<ItemForm>({ ...EMPTY_ITEM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTypes = useCallback(() => {
    apiFetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        setTypes(d.types ?? []);
        if (!slug && d.types?.[0]) setSlug(d.types[0].slug);
      });
  }, [slug]);

  const loadItems = useCallback(() => {
    if (!slug) return;
    apiFetch(`/api/templates?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }, [slug]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const createType = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "checklist_type", ...typeForm }),
      });
      if (!res.ok) {
        toast.error("Could not create checklist type");
        return;
      }
      const d = await res.json();
      setTypeForm({ ...EMPTY_TYPE });
      setTypeModal(false);
      setSlug(d.slug);
      loadTypes();
    } finally {
      setSaving(false);
    }
  };

  const openCreateItem = () => {
    setEditingItemId(null);
    setItemForm({
      ...EMPTY_ITEM,
      checklist_type_slug: slug,
      section: items[0]?.section || "General",
    });
    setItemModal(true);
  };

  const openEditItem = (item: TemplateItem) => {
    setEditingItemId(item.id);
    setItemForm({
      checklist_type_slug: item.checklist_type_slug || slug,
      section: item.section,
      item_text: item.item_text,
      requires_time_entry: !!item.requires_time_entry,
      requires_text_entry: !!item.requires_text_entry,
      is_shift_leader_selector: !!item.is_shift_leader_selector,
      is_active: !!item.is_active,
    });
    setItemModal(true);
  };

  const saveItem = async () => {
    if (!itemForm.item_text.trim()) return;
    setSaving(true);
    try {
      if (editingItemId != null) {
        const res = await apiFetch("/api/templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingItemId,
            checklist_type_slug: itemForm.checklist_type_slug || slug,
            section: itemForm.section.trim() || "General",
            item_text: itemForm.item_text.trim(),
            requires_time_entry: itemForm.requires_time_entry,
            requires_text_entry: itemForm.requires_text_entry,
            is_shift_leader_selector: itemForm.is_shift_leader_selector,
            is_active: itemForm.is_active,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error ?? "Could not update item");
          return;
        }
        const d = await res.json().catch(() => ({}));
        const movedTo = d.checklist_type_slug as string | undefined;
        toast.success("Item updated");
        setItemModal(false);
        setEditingItemId(null);
        if (movedTo && movedTo !== slug) {
          setSlug(movedTo);
        } else {
          loadItems();
        }
        return;
      }

      if (!slug) return;
      const res = await apiFetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "template_item",
          checklist_type_slug: itemForm.checklist_type_slug || slug,
          section: itemForm.section.trim() || "General",
          item_text: itemForm.item_text.trim(),
          requires_time_entry: itemForm.requires_time_entry,
          requires_text_entry: itemForm.requires_text_entry,
          is_shift_leader_selector: itemForm.is_shift_leader_selector,
        }),
      });
      if (!res.ok) {
        toast.error("Could not add item");
        return;
      }
      setItemForm({ ...EMPTY_ITEM, checklist_type_slug: slug });
      setItemModal(false);
      loadItems();
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item: TemplateItem) => {
    const nextActive = item.is_active ? 0 : 1;
    // Optimistic update for instant feedback
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, is_active: nextActive } : it,
      ),
    );
    try {
      const res = await apiFetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          checklist_type_slug: item.checklist_type_slug || slug,
          section: item.section,
          item_text: item.item_text,
          requires_time_entry: !!item.requires_time_entry,
          requires_text_entry: !!item.requires_text_entry,
          is_shift_leader_selector: !!item.is_shift_leader_selector,
          is_active: !!nextActive,
        }),
      });
      if (!res.ok) throw new Error("patch failed");
      loadItems();
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, is_active: item.is_active } : it,
        ),
      );
      toast.error("Could not update item — try again");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/templates?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not delete item");
        return;
      }
      setDeleteTarget(null);
      loadItems();
    } finally {
      setDeleting(false);
    }
  };

  const selected = types.find((t) => t.slug === slug);

  return (
    <>
      <SettingsSection
        title="Checklist types"
        description="Built-in and custom checklists used across the hotel."
        action={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setTypeModal(true)}
          >
            New type
          </Button>
        }
      >
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {types.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setSlug(t.slug)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                slug === t.slug
                  ? "border-accent-500/50 bg-accent-500/15 text-accent-300"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      {selected && (
        <SettingsSection
          title={selected.label}
          description={`${selected.frequency} · Completed by ${roleLabel(
            selected.completer_role,
          )} · Approved by ${roleLabel(selected.approver_role)}`}
          action={
            <Button
              size="sm"
              variant="soft"
              icon={<Plus className="h-4 w-4" />}
              onClick={openCreateItem}
            >
              Add item
            </Button>
          }
          bodyClassName="p-0"
        >
          <List>
            {items.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                No items yet. Add the first one.
              </p>
            )}
            {items.map((item) => (
              <ListRow
                key={item.id}
                className={item.is_active ? "" : "opacity-50"}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                    {item.section}
                  </p>
                  <p className="text-sm text-zinc-200">{item.item_text}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.requires_time_entry ? <Pill tone="sky">Time</Pill> : null}
                    {item.requires_text_entry ? <Pill tone="sky">Text</Pill> : null}
                    {item.is_shift_leader_selector ? (
                      <Pill tone="amber">Shift leader</Pill>
                    ) : null}
                  </div>
                </div>
                <Switch
                  checked={!!item.is_active}
                  onChange={() => toggleItem(item)}
                  label={item.is_active ? "Disable item" : "Enable item"}
                />
                <button
                  type="button"
                  onClick={() => openEditItem(item)}
                  aria-label="Edit item"
                  title="Edit item"
                  className="tap-target flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    aria-label="Delete item"
                    title="Delete item"
                    className="tap-target flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </ListRow>
            ))}
          </List>
        </SettingsSection>
      )}

      {/* New type modal */}
      <Modal
        open={typeModal}
        onClose={() => setTypeModal(false)}
        title="New checklist type"
        description="Create a custom checklist for any department or task."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTypeModal(false)}>
              Cancel
            </Button>
            <Button onClick={createType} disabled={saving || !typeForm.label}>
              {saving ? "Creating…" : "Create type"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" hint="e.g. Car Park, Pool Area">
            <input
              className="input-field"
              value={typeForm.label}
              onChange={(e) =>
                setTypeForm({
                  ...typeForm,
                  label: e.target.value,
                  slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                })
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug">
              <input
                className="input-field"
                value={typeForm.slug}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, slug: e.target.value })
                }
              />
            </Field>
            <Field label="Frequency">
              <select
                className="input-field"
                value={typeForm.frequency}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, frequency: e.target.value })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="event">Per event</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Completed by">
              <select
                className="input-field"
                value={typeForm.completer_role}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, completer_role: e.target.value })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Approved by">
              <select
                className="input-field"
                value={typeForm.approver_role}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, approver_role: e.target.value })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Department tag" hint="Optional">
            <input
              className="input-field"
              value={typeForm.department_tag}
              onChange={(e) =>
                setTypeForm({ ...typeForm, department_tag: e.target.value })
              }
            />
          </Field>
        </div>
      </Modal>

      {/* Add / edit item modal */}
      <Modal
        open={itemModal}
        onClose={() => {
          setItemModal(false);
          setEditingItemId(null);
        }}
        title={
          editingItemId != null
            ? "Edit checklist item"
            : `Add item to ${selected?.label ?? ""}`
        }
        description={
          editingItemId != null
            ? "Change the checklist, section, wording, or options."
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setItemModal(false);
                setEditingItemId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={saveItem}
              disabled={saving || !itemForm.item_text.trim()}
            >
              {saving
                ? "Saving…"
                : editingItemId != null
                  ? "Save changes"
                  : "Add item"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Checklist"
            hint="Which checklist this item belongs to"
          >
            <select
              className="input-field"
              value={itemForm.checklist_type_slug || slug}
              onChange={(e) =>
                setItemForm({
                  ...itemForm,
                  checklist_type_slug: e.target.value,
                })
              }
            >
              {types.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Section"
            hint="Group label shown above the item (e.g. Daily Checks, Handover)"
          >
            <input
              className="input-field"
              list="template-section-suggestions"
              value={itemForm.section}
              onChange={(e) =>
                setItemForm({ ...itemForm, section: e.target.value })
              }
            />
            <datalist id="template-section-suggestions">
              {Array.from(new Set(items.map((i) => i.section).filter(Boolean))).map(
                (section) => (
                  <option key={section} value={section} />
                ),
              )}
            </datalist>
          </Field>
          <Field label="Item text">
            <input
              className="input-field"
              value={itemForm.item_text}
              onChange={(e) =>
                setItemForm({ ...itemForm, item_text: e.target.value })
              }
            />
          </Field>
          <div className="rounded-2xl border border-zinc-800/70 px-4 divide-y divide-zinc-800/60">
            <ToggleRow
              label="Requires time entry"
              checked={itemForm.requires_time_entry}
              onChange={(v) =>
                setItemForm({ ...itemForm, requires_time_entry: v })
              }
            />
            <ToggleRow
              label="Requires text entry"
              checked={itemForm.requires_text_entry}
              onChange={(v) =>
                setItemForm({ ...itemForm, requires_text_entry: v })
              }
            />
            <ToggleRow
              label="Shift leader selector"
              checked={itemForm.is_shift_leader_selector}
              onChange={(v) =>
                setItemForm({ ...itemForm, is_shift_leader_selector: v })
              }
            />
            {editingItemId != null && (
              <ToggleRow
                label="Active"
                description="Inactive items are hidden from new checklist runs"
                checked={itemForm.is_active}
                onChange={(v) => setItemForm({ ...itemForm, is_active: v })}
              />
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        destructive
        loading={deleting}
        title="Delete checklist item"
        confirmLabel="Delete item"
        message={
          <>
            Delete{" "}
            <span className="font-medium text-zinc-200">
              “{deleteTarget?.item_text}”
            </span>
            ? This permanently removes it from the checklist.
          </>
        }
      />
    </>
  );
}
