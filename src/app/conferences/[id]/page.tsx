"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checklistHref } from "@/lib/checklist-slugs";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressBar } from "@/components/checklist/progress-bar";
import { statusColor, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Modal, ConfirmDialog } from "@/components/settings/settings-ui";
import {
  ChecklistCardsSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading/page-skeletons";
import {
  CalendarDays,
  Clock,
  Users,
  User,
  Phone,
  MessageCircle,
  Pencil,
  Trash2,
  Activity,
} from "lucide-react";

interface Assignee {
  id: string;
  display_name: string;
  username: string;
}

interface ActivityItem {
  action: string;
  details: string | null;
  created_at: string;
  actor_name: string;
  checklist_label: string | null;
}

interface ConferenceData {
  conference: {
    id: number;
    name: string;
    status: string;
    start_date: string;
    end_date: string;
    guest_count: number | null;
    coordinator_name: string | null;
    coordinator_phone: string | null;
  };
  sessions: Array<{
    id: number;
    checklist_type_slug: string;
    label: string;
    status: string;
    progress: { total: number; completed: number; na?: number };
    submitted_at?: string | null;
    approved_at?: string | null;
    started_by_name?: string | null;
    approved_by_name?: string | null;
    assignees?: Assignee[];
    contributors?: Assignee[];
  }>;
  hotelWhatsapp: string | null;
  activity?: ActivityItem[];
  past?: boolean;
}

export default function ConferenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<ConferenceData | null>(null);
  const [ready, setReady] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "admin";

  const load = useCallback(() => {
    return fetch(`/api/conferences/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
      });
  }, [id]);

  useEffect(() => {
    setReady(false);
    load().finally(() => setReady(true));
  }, [load]);

  const activate = async () => {
    const res = await fetch(`/api/conferences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Active" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Could not activate conference");
      return;
    }
    toast.success("Conference marked Active");
    load();
  };

  const openEdit = () => {
    if (!data) return;
    const c = data.conference;
    setEditForm({
      name: c.name,
      start_date: c.start_date,
      end_date: c.end_date,
      guest_count: c.guest_count != null ? String(c.guest_count) : "",
      coordinator_name: c.coordinator_name ?? "",
      coordinator_phone: c.coordinator_phone ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (saving) return;
    if (!editForm.name.trim()) {
      toast.error("Conference name is required");
      return;
    }
    if (editForm.start_date && editForm.end_date && editForm.start_date > editForm.end_date) {
      toast.error("Start date must be on or before end date");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          start_date: editForm.start_date,
          end_date: editForm.end_date,
          guest_count: editForm.guest_count === "" ? null : editForm.guest_count,
          coordinator_name: editForm.coordinator_name,
          coordinator_phone: editForm.coordinator_phone,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not update conference");
        return;
      }
      toast.success("Conference updated");
      setEditOpen(false);
      load();
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/conferences/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not delete conference");
        return;
      }
      toast.success("Conference deleted");
      router.push("/conferences");
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (!ready || !data) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <ChecklistCardsSkeleton count={2} />
      </div>
    );
  }

  const { conference, sessions, hotelWhatsapp } = data;
  const duration = daysBetween(conference.start_date, conference.end_date);
  const overallDone = sessions.filter((s) => s.status === "approved").length;
  const staffPhoneDigits = hotelWhatsapp?.replace(/\D/g, "") ?? "";
  const staffBriefing = buildStaffBriefing(conference, sessions);
  const isPast = Boolean(data.past) || conference.status === "Completed";
  const activity = data.activity ?? [];
  const displayStatus = isPast ? "Completed" : conference.status;

  return (
    <div className="space-y-6">
      <PageHeader
        title={conference.name}
        description={formatDateRange(conference.start_date, conference.end_date)}
        backHref={isPast ? "/conferences?view=past" : "/conferences"}
        backLabel="Conferences"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border", statusColor(displayStatus.toLowerCase()))}>
            {displayStatus}
          </Badge>
          {isAdmin && (
            <>
              <Button
                variant="soft"
                size="sm"
                icon={<Pencil className="h-4 w-4" />}
                onClick={openEdit}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Conference details */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <Detail
            icon={CalendarDays}
            label="Dates"
            value={formatDateRange(conference.start_date, conference.end_date)}
          />
          <Detail
            icon={Clock}
            label="Duration"
            value={`${duration} day${duration === 1 ? "" : "s"}`}
          />
          <Detail
            icon={Users}
            label="Guests"
            value={conference.guest_count ? String(conference.guest_count) : "—"}
          />
          <Detail
            icon={User}
            label="Coordinator"
            value={conference.coordinator_name ?? "—"}
          />
          {(conference.coordinator_phone || staffPhoneDigits) && !isPast && (
            <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
              {conference.coordinator_phone && (
                <a
                  href={`https://wa.me/${conference.coordinator_phone.replace(/\D/g, "")}?text=${encodeURIComponent(coordinatorMessage(conference))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Message {conference.coordinator_name ?? "coordinator"}
                </a>
              )}
              {staffPhoneDigits && (
                <a
                  href={`https://wa.me/${staffPhoneDigits}?text=${encodeURIComponent(staffBriefing)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500/40 bg-accent-500/10 px-2.5 py-1 text-xs text-accent-200 transition-colors hover:bg-accent-500/20"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Notify staff on WhatsApp
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked checklists */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">
            Conference checklists
          </h2>
          <span className="text-xs text-zinc-500">
            {overallDone}/{sessions.length} approved
          </span>
        </div>
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={checklistHref(s.checklist_type_slug, s.id)}>
              <Card className="hover:border-zinc-700">
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.label}</span>
                    <Badge className={cn("border", statusColor(s.status))}>
                      {s.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <ProgressBar
                    completed={s.progress.completed}
                    total={s.progress.total}
                    na={s.progress.na}
                  />
                  {s.contributors && s.contributors.length > 0 && (
                    <p className="text-[11px] text-zinc-500">
                      Worked on by:{" "}
                      <span className="text-zinc-400">
                        {s.contributors.map((a) => a.display_name).join(", ")}
                      </span>
                    </p>
                  )}
                  {s.assignees && s.assignees.length > 0 && !s.contributors?.length && (
                    <p className="text-[11px] text-zinc-500">
                      Assigned to:{" "}
                      <span className="text-zinc-400">
                        {s.assignees.map((a) => a.display_name).join(", ")}
                      </span>
                    </p>
                  )}
                  {(s.approved_by_name || s.submitted_at) && (
                    <p className="text-[11px] text-zinc-600">
                      {s.submitted_at
                        ? `Submitted ${formatWhen(s.submitted_at)}`
                        : null}
                      {s.submitted_at && s.approved_by_name ? " · " : null}
                      {s.approved_by_name
                        ? `Approved by ${s.approved_by_name}${
                            s.approved_at ? ` ${formatWhen(s.approved_at)}` : ""
                          }`
                        : null}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
          {sessions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
              No event-frequency checklists are configured. Add one in Settings.
            </div>
          )}
        </div>
      </div>

      {user?.permissions.initiateConference &&
        conference.status === "Planning" &&
        !isPast && (
          <Button onClick={activate} className="w-full sm:w-auto">
            Mark conference Active
          </Button>
        )}

      {activity.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Activity</h2>
          <Card>
            <CardContent className="divide-y divide-zinc-800/80 p-0">
              {activity.map((item, i) => (
                <div key={`${item.created_at}-${i}`} className="flex items-start gap-3 px-4 py-3">
                  <Activity className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">
                      <span className="font-medium text-zinc-100">
                        {item.actor_name}
                      </span>{" "}
                      <span className="text-zinc-400">
                        {activityLabel(item.action)}
                      </span>
                      {item.checklist_label ? (
                        <span className="text-zinc-500">
                          {" "}
                          · {item.checklist_label}
                        </span>
                      ) : null}
                    </p>
                    {item.details && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                        {item.details}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 text-[11px] text-zinc-500"
                    title={new Date(item.created_at).toLocaleString()}
                  >
                    {timeAgo(item.created_at)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit conference"
        description="Rename, reschedule, or update coordinator details."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={saving || !editForm.name.trim()}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400">Conference name</label>
            <input
              className="input-field mt-1"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400">Start date</label>
              <input
                type="date"
                className="input-field mt-1"
                value={editForm.start_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, start_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">End date</label>
              <input
                type="date"
                className="input-field mt-1"
                min={editForm.start_date || undefined}
                value={editForm.end_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, end_date: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Guest count</label>
            <input
              type="number"
              min={1}
              className="input-field mt-1"
              value={editForm.guest_count}
              onChange={(e) =>
                setEditForm({ ...editForm, guest_count: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400">Coordinator name</label>
              <input
                className="input-field mt-1"
                value={editForm.coordinator_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, coordinator_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Coordinator phone</label>
              <input
                className="input-field mt-1"
                value={editForm.coordinator_phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, coordinator_phone: e.target.value })
                }
              />
            </div>
          </div>
          {editForm.start_date !== data.conference.start_date && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Changing the start date will also move all linked checklists to
              the new date.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete conference?"
        message={
          <>
            <strong className="text-zinc-200">{conference.name}</strong> and its{" "}
            {sessions.length} linked checklist
            {sessions.length === 1 ? "" : "s"} will be permanently removed.
            Faults reported during the conference are kept as standalone
            records. This cannot be undone.
          </>
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        loading={deleting}
      />
    </div>
  );
}

interface EditForm {
  name: string;
  start_date: string;
  end_date: string;
  guest_count: string;
  coordinator_name: string;
  coordinator_phone: string;
}

const EMPTY_EDIT_FORM: EditForm = {
  name: "",
  start_date: "",
  end_date: "",
  guest_count: "",
  coordinator_name: "",
  coordinator_phone: "",
};

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        <p className="truncate text-sm text-zinc-200">{value}</p>
      </div>
    </div>
  );
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (start === end) {
    return s.toLocaleDateString(undefined, { ...opts, year: "numeric" });
  }
  if (sameMonth) {
    return `${s.toLocaleDateString(undefined, opts)} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}, ${e.getFullYear()}`;
  }
  return `${s.toLocaleDateString(undefined, { ...opts, year: "numeric" })} – ${e.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

function coordinatorMessage(conference: ConferenceData["conference"]): string {
  return `Hello ${conference.coordinator_name ?? ""},\n\nYour event *${conference.name}* is scheduled at Maya Villa Hotel (${formatDateRange(conference.start_date, conference.end_date)}). We're preparing everything and will be in touch as we finalise the details.\n\nMaya Villa Hotel`;
}

function buildStaffBriefing(
  conference: ConferenceData["conference"],
  sessions: ConferenceData["sessions"],
): string {
  const lines = [
    `*New conference scheduled — ${conference.name}*`,
    "",
    `Dates: ${formatDateRange(conference.start_date, conference.end_date)}`,
    conference.guest_count ? `Guests: ${conference.guest_count}` : null,
    conference.coordinator_name
      ? `Coordinator: ${conference.coordinator_name}`
      : null,
    "",
    "Please complete the following checklists before the event:",
    ...sessions.map((s) => {
      const who =
        s.assignees && s.assignees.length > 0
          ? ` (${s.assignees.map((a) => a.display_name).join(", ")})`
          : "";
      return `- ${s.label}${who}`;
    }),
    "",
    "Open the app to start.",
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    conference_created: "created this conference",
    conference_updated: "updated this conference",
    conference_status_changed: "changed the status",
    checklist_opened: "opened a checklist",
    checklist_started: "started a checklist",
    checklist_submitted: "submitted a checklist",
    checklist_approved: "approved a checklist",
    checklist_rejected: "sent a checklist back",
    checklist_item_photo_added: "added a photo",
    checklist_reopened: "reopened a checklist",
    fault_reported: "reported a fault",
    fault_resolved: "resolved a fault",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}

function timeAgo(iso: string): string {
  const parsed = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(parsed).getTime();
  const mins = Math.floor(diff / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(parsed).toLocaleDateString();
}

function formatWhen(iso: string): string {
  const parsed = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(parsed);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
