"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Loader2,
  MessageCircle,
  UserCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/fetch";
import {
  buildChecklistWhatsAppSummary,
  uniqueCheckerNames,
  type SummaryItem,
} from "@/lib/checklist-summary";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

type SessionPayload = {
  session: {
    id: number | string;
    status: string;
    date: string;
    started_by_user_id?: string | null;
  };
  type: { label: string; slug?: string };
  items: SummaryItem[];
  progress: {
    total: number;
    checked: number;
    faulty: number;
    na: number;
    completed: number;
  };
};

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function markForStatus(status: string | null): string {
  if (status === "checked") return "✅";
  if (status === "na") return "➖ N/A";
  // faulty, not_done, pending, or anything else → red cross
  return "❌";
}

export function ReviewChecklistModal({
  open,
  sessionId,
  onClose,
  onResolved,
}: {
  open: boolean;
  sessionId: string | null;
  onClose: () => void;
  onResolved?: () => void;
}) {
  const mounted = useMounted();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionPayload | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/checklists/sessions/${sessionId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Could not load checklist");
        setData(null);
        return;
      }
      const json = await res.json();
      setData({
        session: json.session,
        type: json.type,
        items: json.items ?? [],
        progress: json.progress,
      });
    } catch {
      setError("Could not load checklist");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!open || !sessionId) return;
    setRejectReason("");
    setShowReject(false);
    setCopied(false);
    load();
  }, [open, sessionId, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const checkers = useMemo(
    () => (data ? uniqueCheckerNames(data.items) : []),
    [data],
  );

  const summaryText = useMemo(() => {
    if (!data) return "";
    return buildChecklistWhatsAppSummary({
      label: data.type.label,
      date: data.session.date,
      items: data.items,
    });
  }, [data]);

  const sections = useMemo(() => {
    if (!data) return [] as Array<[string, SummaryItem[]]>;
    const map = new Map<string, SummaryItem[]>();
    for (const item of data.items) {
      if (item.is_shift_leader_selector) continue;
      const key = (item.section || "General").trim();
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [data]);

  const handleCopy = async () => {
    if (!summaryText) return;
    const ok = await copyText(summaryText);
    if (ok) {
      setCopied(true);
      toast.success("Copied — paste into WhatsApp");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy");
    }
  };

  const handleWhatsApp = async () => {
    if (!summaryText) return;
    await copyText(summaryText);
    toast.success("Copied — opening WhatsApp");
    const url = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const approve = async () => {
    if (!sessionId) return;
    setBusy("approve");
    try {
      const res = await apiFetch(`/api/checklists/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not approve");
        return;
      }
      toast.success("Checklist approved");
      onResolved?.();
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!sessionId || !rejectReason.trim()) {
      setShowReject(true);
      toast.error("Add a reason for not approving");
      return;
    }
    setBusy("reject");
    try {
      const res = await apiFetch(`/api/checklists/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          reason: rejectReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not reject");
        return;
      }
      toast.success("Marked not approved");
      onResolved?.();
      onClose();
    } finally {
      setBusy(null);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-checklist-title"
        className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
              Review submission
            </p>
            <h2
              id="review-checklist-title"
              className="mt-0.5 truncate text-lg font-semibold text-zinc-50"
            >
              {data?.type.label ?? "Checklist"}
            </h2>
            {data && (
              <p className="mt-1 text-xs text-zinc-500">
                {data.session.date} · {data.progress.checked}/
                {data.progress.total} checked
                {data.progress.faulty > 0
                  ? ` · ${data.progress.faulty} fault(s)`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading review…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => load()}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <UserCheck className="h-3.5 w-3.5" />
                  Checked by{" "}
                  {checkers.length > 0 ? checkers.join(", ") : "—"}
                </span>
                {data.progress.faulty > 0 && (
                  <span className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                    {data.progress.faulty} issue
                    {data.progress.faulty === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {sections.map(([section, items]) => (
                  <div key={section}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      {/gas|cylinder/i.test(section)
                        ? "Cylinder status"
                        : section}
                    </h3>
                    <ul className="space-y-1 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                      {items.map((item, idx) => (
                        <li
                          key={`${section}-${idx}-${item.item_text}`}
                          className="flex gap-2 text-sm leading-snug text-zinc-200"
                        >
                          <span className="shrink-0 pt-0.5">
                            {markForStatus(item.response_status)}
                          </span>
                          <span className="min-w-0">
                            <span className="text-zinc-100">{item.item_text}</span>
                            {item.text_value?.trim() && (
                              <span className="mt-0.5 block whitespace-pre-wrap text-xs text-zinc-400">
                                {item.text_value.trim()}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Copy for WhatsApp
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        copied
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600",
                      )}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={handleWhatsApp}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </button>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-black/40 px-3 py-3 font-sans text-[12px] leading-relaxed text-zinc-300">
                  {summaryText}
                </pre>
              </div>

              {showReject && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Reason not approved
                  </label>
                  <textarea
                    className="input-field min-h-[72px] w-full resize-y"
                    placeholder="What needs to be fixed before approval?"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-zinc-800/80 px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="soft"
              className="w-full"
              onClick={onClose}
              disabled={busy != null}
            >
              Cancel
            </Button>
            <Button
              className="w-full"
              onClick={approve}
              disabled={busy != null || loading || !data}
              icon={
                busy === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )
              }
            >
              Approve
            </Button>
          </div>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (!showReject) {
                setShowReject(true);
                return;
              }
              reject();
            }}
            disabled={busy != null || loading || !data}
            icon={
              busy === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )
            }
          >
            Not approved
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
