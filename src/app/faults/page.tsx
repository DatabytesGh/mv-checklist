"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeRefresh } from "@/providers/realtime-provider";
import { apiFetch } from "@/lib/fetch";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Modal, Field } from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { FaultCaptureSheet } from "@/components/checklist/fault-capture-sheet";
import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading/page-skeletons";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Plus,
  Send,
  Wrench,
  MessageCircle,
} from "lucide-react";

interface Fault {
  id: number | string;
  title: string;
  description: string;
  location: string | null;
  severity: string;
  status: string;
  vendor_name: string | null;
  vendor_whatsapp: string | null;
  vendor_phone: string | null;
  reporter_name: string | null;
  reported_at: string;
  whatsapp_sent: number;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolver_name: string | null;
  photos?: string[];
}

type FaultFilter = "active" | "resolved" | "all";

const FILTERS: { id: FaultFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

function statusMeta(status: string): {
  label: string;
  icon: typeof AlertCircle;
  tile: string;
} {
  switch (status) {
    case "resolved":
      return {
        label: "Resolved",
        icon: CheckCircle2,
        tile: "bg-emerald-500/15 text-emerald-400",
      };
    case "reported":
      return {
        label: "Reported",
        icon: Send,
        tile: "bg-sky-500/15 text-sky-400",
      };
    case "in_progress":
      return {
        label: "In progress",
        icon: Wrench,
        tile: "bg-sky-500/15 text-sky-400",
      };
    case "closed":
      return {
        label: "Closed",
        icon: CheckCircle2,
        tile: "bg-zinc-500/15 text-zinc-400",
      };
    default:
      return {
        label: "Open",
        icon: AlertCircle,
        tile: "bg-amber-500/15 text-amber-400",
      };
  }
}

function severityMeta(severity: string): { label: string; cls: string } {
  switch (severity) {
    case "critical":
      return { label: "Critical", cls: "bg-red-500/15 text-red-300" };
    case "high":
      return { label: "High", cls: "bg-orange-500/15 text-orange-300" };
    case "low":
      return { label: "Low", cls: "bg-zinc-500/15 text-zinc-400" };
    default:
      return { label: "Medium", cls: "bg-amber-500/15 text-amber-300" };
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function FaultsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [faults, setFaults] = useState<Fault[]>([]);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [ready, setReady] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Fault | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [filter, setFilter] = useState<FaultFilter>("active");
  const [vendors, setVendors] = useState<
    Array<{ id: string | number; name: string }>
  >([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | number | null>(null);

  const load = useCallback(() => {
    apiFetch("/api/faults")
      .then((r) => r.json())
      .then((d) => setFaults(d.faults ?? []))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    load();
    apiFetch("/api/vendors")
      .then((r) => (r.ok ? r.json() : { vendors: [] }))
      .then((d) => setVendors(d.vendors ?? []))
      .catch(() => setVendors([]));
  }, [load]);

  useRealtimeRefresh(load);

  // Deep-link: open & scroll to a specific fault when arriving via ?open=<id>
  // (e.g. tapping a fault icon on a checklist item).
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (!ready || openedFromUrl.current) return;
    const target = new URLSearchParams(window.location.search).get("open");
    if (!target) return;
    openedFromUrl.current = true;
    const fault = faults.find((f) => String(f.id) === target);
    if (!fault) return;
    if (fault.status === "resolved") setFilter("all");
    setExpanded(fault.id);
    requestAnimationFrame(() => {
      document
        .getElementById(`fault-${fault.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [ready, faults]);

  const sendWa = async (fault: Fault) => {
    const rawPhone = fault.vendor_whatsapp || fault.vendor_phone;
    if (!rawPhone) {
      toast.error("Vendor has no phone number — add one in Settings → Vendors.");
      return;
    }

    setSendingId(fault.id);
    try {
      const res = await apiFetch("/api/faults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_whatsapp", faultId: fault.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not send WhatsApp to vendor");
        return;
      }
      toast.success("Message sent to vendor on WhatsApp");
      load();
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setSendingId(null);
    }
  };

  const openResolve = (fault: Fault) => {
    setResolveTarget(fault);
    setResolveNotes("");
  };

  const confirmResolve = async () => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      const res = await apiFetch("/api/faults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          faultId: resolveTarget.id,
          notes: resolveNotes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not resolve fault");
        return;
      }
      setResolveTarget(null);
      toast.success("Fault marked as resolved");
      load();
    } catch {
      toast.error("Connection lost — try again");
    } finally {
      setResolving(false);
    }
  };

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <ListRowsSkeleton count={6} />
      </div>
    );
  }

  const counts = {
    active: faults.filter((f) => f.status !== "resolved").length,
    resolved: faults.filter((f) => f.status === "resolved").length,
    all: faults.length,
  };
  const visible = faults.filter((f) =>
    filter === "all"
      ? true
      : filter === "resolved"
        ? f.status === "resolved"
        : f.status !== "resolved",
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fault reports"
        description="Track issues from report to resolution. Resolved faults stay here for review."
      >
        {user?.permissions.reportFault && (
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setReportOpen(true)}
          >
            Report fault
          </Button>
        )}
      </PageHeader>

      {/* Segmented filter */}
      <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === tab.id
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                filter === tab.id
                  ? "bg-zinc-700 text-zinc-200"
                  : "bg-zinc-800/80 text-zinc-500",
              )}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((f) => {
          const sm = statusMeta(f.status);
          const sev = severityMeta(f.severity);
          const Icon = sm.icon;
          const isOpen = expanded === f.id;
          const isResolved = f.status === "resolved";

          return (
            <div
              key={f.id}
              id={`fault-${f.id}`}
              className={cn(
                "scroll-mt-24 overflow-hidden rounded-2xl border bg-zinc-950/50 transition-colors",
                isOpen
                  ? "border-zinc-700"
                  : "border-zinc-800/80 hover:border-zinc-700",
              )}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : f.id)}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    sm.tile,
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        "truncate font-medium",
                        isResolved
                          ? "text-zinc-400 line-through decoration-zinc-700"
                          : "text-zinc-100",
                      )}
                    >
                      {f.title}
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        sev.cls,
                      )}
                    >
                      {sev.label}
                    </span>
                  </div>

                  {f.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">
                      {f.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                    <span className={cn("font-medium", sm.tile.split(" ")[1])}>
                      {sm.label}
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span>{f.reporter_name ?? "Unknown"}</span>
                    <span className="text-zinc-700">·</span>
                    <span>{timeAgo(f.reported_at)}</span>
                    {f.whatsapp_sent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-1.5 py-0.5 text-[10px] text-accent-300">
                        <MessageCircle className="h-2.5 w-2.5" />
                        Sent
                      </span>
                    ) : null}
                  </div>
                </div>

                <ChevronDown
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 text-zinc-500 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-zinc-800/70 px-4 pb-4 pt-3">
                  <p className="text-sm leading-relaxed text-zinc-300">
                    {f.description}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    {f.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {f.location}
                      </span>
                    )}
                    <span>Vendor: {f.vendor_name ?? "None assigned"}</span>
                    <span>Reported {new Date(f.reported_at).toLocaleString()}</span>
                  </div>

                  {f.photos && f.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {f.photos.map((photo) => (
                        <a
                          key={photo}
                          href={photo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-xl border border-zinc-700"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo}
                            alt="Fault"
                            className="h-24 w-24 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {isResolved && (
                    <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-emerald-300">
                          Resolved
                          {f.resolver_name ? ` by ${f.resolver_name}` : ""}
                          {f.resolved_at
                            ? ` · ${new Date(f.resolved_at).toLocaleString()}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {f.resolution_notes?.trim()
                            ? f.resolution_notes
                            : "No resolution notes added."}
                        </p>
                      </div>
                    </div>
                  )}

                  {!isResolved && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {f.vendor_name && (
                        <Button
                          size="sm"
                          variant="soft"
                          icon={<Send className="h-3.5 w-3.5" />}
                          disabled={sendingId === f.id}
                          onClick={() => sendWa(f)}
                        >
                          {sendingId === f.id
                            ? "Sending…"
                            : f.whatsapp_sent
                              ? "Resend message"
                              : "Send message"}
                        </Button>
                      )}
                      {f.whatsapp_sent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-accent-300">
                          <MessageCircle className="h-3 w-3" />
                          Message sent to vendor
                        </span>
                      ) : null}
                      {user?.permissions.resolveFault && (
                        <Button
                          size="sm"
                          variant="primary"
                          className="ml-auto"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => openResolve(f)}
                        >
                          Resolve fault
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">
              {faults.length === 0
                ? "No fault reports yet."
                : filter === "resolved"
                  ? "No resolved faults yet."
                  : "No active faults — everything is resolved."}
            </p>
          </div>
        )}
      </div>

      <Modal
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve fault"
        description={resolveTarget?.title}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setResolveTarget(null)}
              disabled={resolving}
            >
              Cancel
            </Button>
            <Button onClick={confirmResolve} disabled={resolving}>
              {resolving ? "Resolving…" : "Mark resolved"}
            </Button>
          </>
        }
      >
        <Field
          label="Resolution notes"
          hint="Optional — describe how this was fixed."
        >
          <textarea
            className="input-field min-h-[6rem] resize-y"
            placeholder="e.g. Replaced the batteries and tested."
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            autoFocus
          />
        </Field>
      </Modal>

      <FaultCaptureSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        vendors={vendors}
        onSaved={load}
      />
    </div>
  );
}
