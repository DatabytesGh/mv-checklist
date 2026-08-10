"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/settings/settings-ui";
import { ListRowsSkeleton, PageHeaderSkeleton } from "@/components/loading/page-skeletons";
import { Calendar, CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conference {
  id: number;
  name: string;
  institution: string | null;
  start_date: string;
  end_date: string;
  status: string;
  guest_count: number | null;
  checklistProgress?: { total: number; approved: number };
}

const EMPTY_FORM = {
  name: "",
  start_date: "",
  end_date: "",
  guest_count: "",
  coordinator_name: "",
  coordinator_phone: "",
};

export default function ConferencesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Conference | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = user?.role === "admin";

  const load = () =>
    fetch("/api/conferences")
      .then((r) => r.json())
      .then((d) => setConferences(d.conferences ?? []))
      .catch(() => setConferences([]));

  const [ready, setReady] = useState(false);

  useEffect(() => {
    load().finally(() => setReady(true));
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/conferences/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not delete conference");
        return;
      }
      toast.success(`Deleted “${deleteTarget.name}”`);
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setDeleting(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/conferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          guest_count: form.guest_count ? Number(form.guest_count) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not create conference");
        return;
      }
      const data = (await res.json()) as {
        id: number;
        sessions?: Array<{ id: number | string }>;
      };
      const count = data.sessions?.length ?? 0;
      toast.success(
        count > 0
          ? `Conference created — ${count} checklist${count === 1 ? "" : "s"} activated`
          : "Conference created",
      );
      setForm(EMPTY_FORM);
      setShowForm(false);
      router.push(`/conferences/${data.id}`);
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setCreating(false);
    }
  };

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <ListRowsSkeleton count={4} />
      </div>
    );
  }

  const today = localToday();
  const upcoming = conferences.filter((c) => c.end_date >= today);
  const past = conferences.filter((c) => c.end_date < today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Conferences" />
        {user?.permissions.initiateConference && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "New conference"}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent>
            <form onSubmit={create} className="space-y-3 py-4">
              <div>
                <label className="text-xs text-zinc-400">Conference name</label>
                <input
                  className="input-field mt-1"
                  placeholder="e.g. Rotary Annual Retreat"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Start date</label>
                  <input
                    type="date"
                    className="input-field mt-1"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">End date</label>
                  <input
                    type="date"
                    className="input-field mt-1"
                    required
                    min={form.start_date || undefined}
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400">Guest count</label>
                <input
                  type="number"
                  min={1}
                  className="input-field mt-1"
                  placeholder="Number of expected guests"
                  value={form.guest_count}
                  onChange={(e) => setForm({ ...form, guest_count: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Coordinator name</label>
                  <input
                    className="input-field mt-1"
                    placeholder="Optional"
                    value={form.coordinator_name}
                    onChange={(e) =>
                      setForm({ ...form, coordinator_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Coordinator phone</label>
                  <input
                    className="input-field mt-1"
                    placeholder="+233..."
                    value={form.coordinator_phone}
                    onChange={(e) =>
                      setForm({ ...form, coordinator_phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={creating || !form.name.trim() || !form.start_date || !form.end_date}
              >
                {creating ? "Creating…" : "Create conference"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {upcoming.length > 0 && (
          <section className="space-y-3">
            {past.length > 0 && (
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Upcoming & active
              </h2>
            )}
            <div className="flex flex-col gap-4">
              {upcoming.map((c) => (
                <ConferenceRow key={c.id} conference={c} />
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Past conferences
            </h2>
            <div className="flex flex-col gap-4">
              {past.map((c) => (
                <ConferenceRow
                  key={c.id}
                  conference={c}
                  past
                  canDelete={isAdmin}
                  onDelete={() => setDeleteTarget(c)}
                />
              ))}
            </div>
          </section>
        )}

        {conferences.length === 0 && !showForm && (
          <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
            <Calendar className="mx-auto h-8 w-8 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">
              No conferences yet.
              {user?.permissions.initiateConference
                ? " Click New conference to plan one."
                : ""}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete conference?"
        message={
          deleteTarget
            ? `“${deleteTarget.name}” and its linked checklists will be permanently removed. Fault history is kept.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />
    </div>
  );
}

function ConferenceRow({
  conference: c,
  past = false,
  canDelete = false,
  onDelete,
}: {
  conference: Conference;
  past?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const progress = c.checklistProgress ?? { total: 0, approved: 0 };
  const allDone = progress.total > 0 && progress.approved === progress.total;

  return (
    <Card
      className={cn(
        "transition-colors",
        past
          ? "border-zinc-800/60 bg-zinc-950/40 opacity-70 hover:opacity-100 hover:border-zinc-700"
          : "hover:border-zinc-700",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3 py-5">
        <Link href={`/conferences/${c.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "font-medium",
                past ? "text-zinc-400" : "text-zinc-100",
              )}
            >
              {c.name}
            </h3>
            {allDone && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  past
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500/80"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                Checklists Completed
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1 text-sm",
              past ? "text-zinc-600" : "text-zinc-500",
            )}
          >
            {formatDateRange(c.start_date, c.end_date)}
            {c.guest_count ? ` · ${c.guest_count} guests` : ""}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            className={cn(
              "border",
              past
                ? "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                : "border-zinc-700 bg-zinc-900 text-zinc-300",
            )}
          >
            {past ? "Completed" : c.status}
          </Badge>
          {canDelete && onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete ${c.name}`}
              icon={<Trash2 className="h-4 w-4 text-red-400" />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
