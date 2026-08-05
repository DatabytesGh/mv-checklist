"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ListRowsSkeleton } from "@/components/loading/page-skeletons";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  LogIn,
  LogOut,
  Pencil,
  PlayCircle,
  Search,
  Send,
  Settings,
  Trash2,
  Truck,
  UserCog,
  UserPlus,
  Wrench,
  XCircle,
} from "lucide-react";

interface Log {
  id: number;
  action: string;
  username: string | null;
  entity_type: string | null;
  details: string | null;
  created_at: string;
}

type Meta = { label: string; icon: typeof Activity; tile: string };

const ACTION_META: Record<string, Meta> = {
  login: { label: "Signed in", icon: LogIn, tile: "bg-sky-500/15 text-sky-400" },
  logout: {
    label: "Signed out",
    icon: LogOut,
    tile: "bg-zinc-500/15 text-zinc-400",
  },
  checklist_started: {
    label: "Started a checklist",
    icon: PlayCircle,
    tile: "bg-sky-500/15 text-sky-400",
  },
  checklist_submitted: {
    label: "Submitted a checklist",
    icon: Send,
    tile: "bg-accent-500/15 text-accent-400",
  },
  checklist_approved: {
    label: "Approved a checklist",
    icon: CheckCircle2,
    tile: "bg-emerald-500/15 text-emerald-400",
  },
  checklist_rejected: {
    label: "Rejected a checklist",
    icon: XCircle,
    tile: "bg-red-500/15 text-red-400",
  },
  checklist_item_photo_added: {
    label: "Added a photo",
    icon: Camera,
    tile: "bg-violet-500/15 text-violet-400",
  },
  checklist_item_deleted: {
    label: "Deleted a checklist item",
    icon: Trash2,
    tile: "bg-red-500/15 text-red-400",
  },
  user_created: {
    label: "Created a user",
    icon: UserPlus,
    tile: "bg-violet-500/15 text-violet-400",
  },
  user_updated: {
    label: "Updated a user",
    icon: UserCog,
    tile: "bg-violet-500/15 text-violet-400",
  },
  settings_changed: {
    label: "Changed settings",
    icon: Settings,
    tile: "bg-zinc-500/15 text-zinc-400",
  },
  vendor_created: {
    label: "Added a vendor",
    icon: Truck,
    tile: "bg-sky-500/15 text-sky-400",
  },
  vendor_updated: {
    label: "Updated a vendor",
    icon: Truck,
    tile: "bg-sky-500/15 text-sky-400",
  },
  fault_reported: {
    label: "Reported a fault",
    icon: AlertTriangle,
    tile: "bg-amber-500/15 text-amber-400",
  },
  fault_resolved: {
    label: "Resolved a fault",
    icon: Wrench,
    tile: "bg-emerald-500/15 text-emerald-400",
  },
  conference_created: {
    label: "Created a conference",
    icon: CalendarPlus,
    tile: "bg-sky-500/15 text-sky-400",
  },
  conference_updated: {
    label: "Updated a conference",
    icon: Pencil,
    tile: "bg-sky-500/15 text-sky-400",
  },
  conference_status_changed: {
    label: "Changed conference status",
    icon: CalendarCheck,
    tile: "bg-accent-500/15 text-accent-400",
  },
  conference_deleted: {
    label: "Deleted a conference",
    icon: CalendarX,
    tile: "bg-red-500/15 text-red-400",
  },
};

function metaFor(action: string): Meta {
  return (
    ACTION_META[action] ?? {
      label: action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      icon: ClipboardCheck,
      tile: "bg-zinc-500/15 text-zinc-400",
    }
  );
}

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "login", label: "Sign in" },
  { value: "logout", label: "Sign out" },
  { value: "checklist_started", label: "Checklist started" },
  { value: "checklist_submitted", label: "Checklist submitted" },
  { value: "checklist_approved", label: "Checklist approved" },
  { value: "checklist_rejected", label: "Checklist rejected" },
  { value: "checklist_item_photo_added", label: "Photo added" },
  { value: "checklist_item_deleted", label: "Item deleted" },
  { value: "fault_reported", label: "Fault reported" },
  { value: "fault_resolved", label: "Fault resolved" },
  { value: "user_created", label: "User created" },
  { value: "user_updated", label: "User updated" },
  { value: "vendor_created", label: "Vendor added" },
  { value: "vendor_updated", label: "Vendor updated" },
  { value: "conference_created", label: "Conference created" },
  { value: "conference_updated", label: "Conference updated" },
  { value: "conference_status_changed", label: "Conference status changed" },
  { value: "conference_deleted", label: "Conference deleted" },
  { value: "settings_changed", label: "Settings changed" },
];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .finally(() => setReady(true));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter && l.action !== filter) return false;
      if (!q) return true;
      const hay = `${l.username ?? ""} ${l.action} ${metaFor(l.action).label} ${
        l.details ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [logs, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Log[]>();
    for (const l of visible) {
      const key = dayKey(l.created_at);
      const list = map.get(key) ?? [];
      list.push(l);
      map.set(key, list);
    }
    return Array.from(map.values());
  }, [visible]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Every action across the system, newest first."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input-field pl-9"
            placeholder="Search by user, action or detail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input-field sm:max-w-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!ready ? (
        <ListRowsSkeleton count={8} />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">No matching activity</p>
          <p className="text-xs text-zinc-600">
            Try a different action filter or search term.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={dayKey(group[0].created_at)}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {dayLabel(group[0].created_at)}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/40">
                {group.map((l, i) => {
                  const meta = metaFor(l.action);
                  const Icon = meta.icon;
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3",
                        i > 0 && "border-t border-zinc-800/60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          meta.tile,
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200">
                          <span className="font-medium text-zinc-100">
                            {l.username ?? "System"}
                          </span>{" "}
                          <span className="text-zinc-400">
                            {meta.label.replace(/^\w/, (c) => c.toLowerCase())}
                          </span>
                        </p>
                        {l.details && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                            {l.details}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="text-[11px] text-zinc-500"
                          title={new Date(l.created_at).toLocaleString()}
                        >
                          {timeAgo(l.created_at)}
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                          {initials(l.username ?? "System")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
