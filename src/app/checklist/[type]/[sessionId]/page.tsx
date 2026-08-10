"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/checklist/progress-bar";
import { FaultCaptureSheet } from "@/components/checklist/fault-capture-sheet";
import { ItemPhotos } from "@/components/checklist/item-photos";
import { ReviewChecklistModal } from "@/components/checklist/review-checklist-modal";
import { ShiftLeaderPicker } from "@/components/checklist/shift-leader-picker";
import { TimePicker } from "@/components/checklist/time-picker";
import { formatNow } from "@/lib/time-format";
import { cn, statusColor } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Check, X, AlertTriangle, Camera, Loader2, CircleMinus } from "lucide-react";
import { ChecklistSessionSkeleton } from "@/components/loading/page-skeletons";
import { apiFetch } from "@/lib/fetch";
import { checklistHref, normalizeChecklistSlug } from "@/lib/checklist-slugs";
import { useRealtimeRefresh } from "@/providers/realtime-provider";
import { usePageTitle } from "@/hooks/use-page-title";
import { PageHeader } from "@/components/layout/page-header";

const STORAGE_PREFIX = "mv-checklist-draft-";

interface Item {
  id: string | number;
  response_id: string | number | null;
  section: string;
  item_text: string;
  requires_time_entry: number;
  requires_text_entry: number;
  is_shift_leader_selector: number;
  response_status: string | null;
  text_value: string | null;
  time_value: string | null;
  checked_at: string | null;
  checked_by_user_id: string | null;
  checked_by_name: string | null;
  checked_by_username: string | null;
  photos?: { id: string; url: string }[];
  faultId?: string | number | null;
  faultPhotos?: string[];
}

export default function ChecklistSessionPage({
  params,
}: {
  params: Promise<{ type: string; sessionId: string }>;
}) {
  const { type, sessionId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{
    session: { id: number; status: string; rejection_reason: string | null };
    type: { label: string };
    items: Item[];
    progress: {
      total: number;
      addressed: number;
      completed: number;
      pending: number;
      faulty: number;
      na: number;
      not_done: number;
      checked: number;
    };
    shiftLeaders: Array<{
      id: string;
      display_name: string | null;
      username: string;
      name?: string;
    }>;
  } | null>(null);
  const [vendors, setVendors] = useState<Array<{ id: number; name: string }>>([]);
  const [faultOpen, setFaultOpen] = useState(false);
  const [faultItem, setFaultItem] = useState<Item | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<"loading" | "ready" | "error">("loading");

  const storageKey = `${STORAGE_PREFIX}${sessionId}`;
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!sessionId || sessionId === "null") return;
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      if (!opts?.silent) {
        setFetchState("loading");
      }

      try {
        const res = await apiFetch(`/api/checklists/sessions/${sessionId}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setLoadError(err.error ?? "Could not load checklist");
          setFetchState("error");
          return;
        }
        const json = await res.json();
        if (!json.type?.label) {
          setLoadError("This checklist is not set up in the system yet.");
          setFetchState("error");
          return;
        }
        setLoadError(null);
        const mergedItems = (json.items as Item[]).map((item) => {
          // The server is authoritative once an item has a saved status. Only
          // restore a local draft for items the server still has as pending —
          // this prevents a stale draft from masking a status saved elsewhere
          // (e.g. another device) which previously left the button un-checked.
          const serverHasStatus =
            item.response_status != null && item.response_status !== "pending";
          if (serverHasStatus) {
            localStorage.removeItem(`${storageKey}-${item.id}`);
            return item;
          }
          try {
            const raw = localStorage.getItem(`${storageKey}-${item.id}`);
            if (!raw) return item;
            const draft = JSON.parse(raw) as {
              status?: string;
              text_value?: string | null;
              time_value?: string | null;
            };
            return {
              ...item,
              response_status: draft.status ?? item.response_status,
              text_value: draft.text_value ?? item.text_value,
              time_value: draft.time_value ?? item.time_value,
            };
          } catch {
            return item;
          }
        });
        setData({ ...json, items: mergedItems });
        setFetchState("ready");
        const canonical = normalizeChecklistSlug(
          json.type?.slug ?? json.session?.checklist_type_slug ?? type,
        );
        if (normalizeChecklistSlug(type) !== canonical) {
          router.replace(checklistHref(canonical, sessionId));
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "Load failed" || msg === "Failed to fetch") {
          setLoadError("Connection lost — check Wi‑Fi and tap Retry");
        } else {
          setLoadError("Could not load checklist");
        }
        setFetchState("error");
      }
    },
    [sessionId, type, router],
  );

  useEffect(() => {
    if (!sessionId || sessionId === "null") {
      apiFetch("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: type }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.session?.id) {
            router.replace(`/checklist/${type}/${d.session.id}`);
          }
        });
      return;
    }
    load();
    apiFetch("/api/vendors")
      .then((r) => r.json())
      .then((d) => setVendors(d.vendors ?? []));
  }, [load, sessionId, type, router]);

  useRealtimeRefresh(() => load({ silent: true }), { sessionId });

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
    },
    [],
  );

  usePageTitle(data?.type?.label);

  const sections = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Item[]>();
    for (const item of data.items) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return Array.from(map.entries());
  }, [data]);

  const updateItem = async (
    item: Item,
    status: string,
    extra?: { text_value?: string; time_value?: string },
  ) => {
    // Prefer explicit extras, then any in-progress local draft (notes typed
    // before Mark done), then the item's last known server values.
    let draftNotes: { text_value?: string | null; time_value?: string | null } =
      {};
    try {
      const raw = localStorage.getItem(`${storageKey}-${item.id}`);
      if (raw) draftNotes = JSON.parse(raw) as typeof draftNotes;
    } catch {
      /* ignore */
    }
    const draft = {
      status,
      text_value:
        extra?.text_value ?? draftNotes.text_value ?? item.text_value ?? null,
      time_value:
        extra?.time_value ?? draftNotes.time_value ?? item.time_value ?? null,
    };
    localStorage.setItem(
      `${storageKey}-${item.id}`,
      JSON.stringify(draft),
    );

    setData((state) => {
      if (!state) return state;
      const p = { ...state.progress, not_done: state.progress.not_done ?? 0 };
      const prevStatus = item.response_status ?? "pending";
      const dec = (s: string) => {
        if (s === "checked") p.checked = Math.max(0, p.checked - 1);
        else if (s === "faulty") p.faulty = Math.max(0, p.faulty - 1);
        else if (s === "na") p.na = Math.max(0, p.na - 1);
        else if (s === "not_done") p.not_done = Math.max(0, p.not_done - 1);
        else if (s === "pending") p.pending = Math.max(0, p.pending - 1);
      };
      const inc = (s: string) => {
        if (s === "checked") p.checked += 1;
        else if (s === "faulty") p.faulty += 1;
        else if (s === "na") p.na += 1;
        else if (s === "not_done") p.not_done += 1;
        else if (s === "pending") p.pending += 1;
      };
      if (prevStatus !== "pending") dec(prevStatus);
      else if (status !== "pending") {
        p.pending = Math.max(0, p.pending - 1);
      }
      inc(status);
      p.addressed = p.checked + p.faulty + p.na + (p.not_done ?? 0);
      p.completed = p.checked + p.faulty;
      // Editing after submit reopens the session — show Submit again immediately.
      const reopened = state.session.status === "submitted";
      return {
        ...state,
        session: reopened
          ? { ...state.session, status: "in_progress" }
          : state.session,
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                response_status: status,
                text_value: draft.text_value,
                time_value: draft.time_value,
                checked_at: new Date().toISOString(),
                checked_by_user_id: user?.id ?? i.checked_by_user_id,
                checked_by_name:
                  user?.display_name ?? user?.username ?? i.checked_by_name,
                checked_by_username: user?.username ?? i.checked_by_username,
              }
            : i,
        ),
        progress: p,
      };
    });

    const res = await apiFetch("/api/checklists/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        templateItemId: String(item.id),
        status,
        textValue: draft.text_value,
        timeValue: draft.time_value,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Could not save item");
      load({ silent: true });
      return;
    }
    // Saved — drop the local draft so the server stays the source of truth and
    // can't be masked later by a stale draft. Then reconcile in the background
    // (exact progress, contributors) without flashing the skeleton.
    localStorage.removeItem(`${storageKey}-${item.id}`);
    load({ silent: true });
  };

  const submit = async () => {
    const pending = data?.progress.pending ?? 0;
    const res = await apiFetch(`/api/checklists/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });
    if (res.ok) {
      setData((state) =>
        state
          ? { ...state, session: { ...state.session, status: "submitted" } }
          : state,
      );
      if (pending > 0) {
        toast.success(
          `${pending} omitted item${pending === 1 ? "" : "s"} marked not done`,
        );
      }
      load();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Cannot submit");
    }
  };

  const notifyApprover = async () => {
    const res = await apiFetch(`/api/checklists/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notify_approver" }),
    });
    if (res.ok) {
      toast.success("Front desk notified on WhatsApp");
      return;
    }
    const err = await res.json().catch(() => ({}));
    toast.error(err.error ?? "Could not send WhatsApp notification");
  };

  if (!sessionId || sessionId === "null" || fetchState === "loading") {
    return <ChecklistSessionSkeleton items={8} />;
  }

  if (fetchState === "error" || !data) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-300">
        <p>{loadError ?? "Could not load checklist"}</p>
        <button type="button" className="mt-3 underline" onClick={() => load()}>
          Retry
        </button>
        <button
          type="button"
          className="ml-4 underline"
          onClick={() => router.push("/")}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  // Only approved checklists are locked. Submitted ones stay editable so staff
  // can undo/redo — the first edit reopens them for re-submit.
  const readonly = data.session.status === "approved";

  // Photos are optional and can be added even after an item is marked done —
  // allowed until the whole checklist is approved (locked).
  const canAddPhotos = data.session.status !== "approved";

  const isSubmitted = data.session.status === "submitted";
  const showActionBar = !readonly;

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title={data.type.label}
        onBack={() => router.back()}
        stickyBelow={
          <ProgressBar
            completed={data.progress.completed}
            total={data.progress.total}
            na={data.progress.na}
            notDone={data.progress.not_done ?? 0}
          />
        }
      >
        <Badge className={cn("border", statusColor(data.session.status))}>
          {data.session.status.replace("_", " ")}
        </Badge>
        {user?.permissions.approveChecklist && isSubmitted && (
          <span className="text-xs text-amber-300">Tap items to review</span>
        )}
      </PageHeader>
      {data.session.rejection_reason && (
        <p className="-mt-2 text-center text-sm text-red-400 md:text-left">
          {data.session.rejection_reason}
        </p>
      )}

      {sections.map(([section, items]) => (
        <div key={section} className="space-y-2.5">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {section}
          </h2>
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const status = item.response_status;
              const done = status === "checked";
              const faulty = status === "faulty";
              const na = status === "na";
              const notDone = status === "not_done";
              const credit =
                status &&
                status !== "pending" &&
                (item.checked_by_name || item.checked_by_username);
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "transition-colors",
                    done && "border-accent-500/40 bg-accent-500/[0.04]",
                    faulty && "border-amber-500/40 bg-amber-500/[0.04]",
                    notDone && "border-red-500/35 bg-red-500/[0.04]",
                    na && "border-zinc-700/70 bg-zinc-900/40",
                  )}
                >
                  <CardContent className="space-y-2 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <StatusDot status={status} />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm leading-snug",
                            na || notDone ? "text-zinc-500" : "text-zinc-100",
                          )}
                        >
                          {item.item_text}
                        </p>
                        {credit && (
                          <ResponseCredit
                            status={status!}
                            name={
                              item.checked_by_name ??
                              item.checked_by_username ??
                              ""
                            }
                            at={item.checked_at}
                          />
                        )}
                      </div>
                    </div>

                    {item.is_shift_leader_selector ? (
                      <ShiftLeaderPicker
                        disabled={readonly}
                        value={
                          // Hide stale login ids (e.g. "user-hk") from older saves.
                          item.text_value &&
                          !/^user[-_]/i.test(item.text_value)
                            ? item.text_value
                            : ""
                        }
                        options={data.shiftLeaders.map((u) => ({
                          id: u.id,
                          name: u.name ?? u.display_name ?? u.username,
                        }))}
                        onChange={(name) =>
                          updateItem(item, "checked", {
                            text_value: name,
                          })
                        }
                      />
                    ) : (
                      <>
                        {item.requires_text_entry ? (
                          <input
                            className="input-field"
                            placeholder="Notes"
                            disabled={readonly}
                            value={item.text_value ?? ""}
                            onChange={(e) => {
                              const text_value = e.target.value;
                              setData((state) => {
                                if (!state) return state;
                                return {
                                  ...state,
                                  items: state.items.map((i) =>
                                    i.id === item.id ? { ...i, text_value } : i,
                                  ),
                                };
                              });
                              try {
                                const raw = localStorage.getItem(
                                  `${storageKey}-${item.id}`,
                                );
                                const prev = raw
                                  ? (JSON.parse(raw) as Record<string, unknown>)
                                  : {};
                                localStorage.setItem(
                                  `${storageKey}-${item.id}`,
                                  JSON.stringify({
                                    ...prev,
                                    text_value,
                                    status: item.response_status ?? "pending",
                                  }),
                                );
                              } catch {
                                /* ignore */
                              }
                            }}
                            onBlur={(e) => {
                              if (
                                item.response_status === "checked" ||
                                item.response_status === "faulty"
                              ) {
                                updateItem(item, item.response_status, {
                                  text_value: e.target.value,
                                });
                              }
                            }}
                          />
                        ) : null}
                        {item.requires_time_entry ? (
                          <TimePicker
                            disabled={readonly}
                            value={item.time_value ?? ""}
                            onChange={(time_value) => {
                              setData((state) => {
                                if (!state) return state;
                                return {
                                  ...state,
                                  items: state.items.map((i) =>
                                    i.id === item.id ? { ...i, time_value } : i,
                                  ),
                                };
                              });
                              try {
                                const raw = localStorage.getItem(
                                  `${storageKey}-${item.id}`,
                                );
                                const prev = raw
                                  ? (JSON.parse(raw) as Record<string, unknown>)
                                  : {};
                                localStorage.setItem(
                                  `${storageKey}-${item.id}`,
                                  JSON.stringify({
                                    ...prev,
                                    time_value,
                                    status: item.response_status ?? "pending",
                                  }),
                                );
                              } catch {
                                /* ignore */
                              }
                              if (
                                item.response_status === "checked" ||
                                item.response_status === "faulty"
                              ) {
                                updateItem(item, item.response_status, {
                                  time_value,
                                });
                              }
                            }}
                          />
                        ) : null}
                      </>
                    )}

                    {!readonly && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Mark done"
                          className={cn(
                            "inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border text-xs font-medium transition-colors",
                            done
                              ? "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/20"
                              : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-accent-500/50 hover:text-accent-300",
                          )}
                          onClick={() => {
                            const latest =
                              data.items.find((i) => i.id === item.id) ?? item;
                            // Tap again to undo → pending.
                            if (latest.response_status === "checked") {
                              updateItem(latest, "pending");
                              return;
                            }
                            if (
                              latest.requires_text_entry &&
                              !latest.is_shift_leader_selector &&
                              !latest.text_value?.trim()
                            ) {
                              toast.error(
                                `Add notes for "${latest.item_text}" before marking done`,
                              );
                              return;
                            }
                            const time_value =
                              latest.time_value?.trim() ||
                              (latest.requires_time_entry ? formatNow() : null);
                            updateItem(
                              latest,
                              "checked",
                              time_value
                                ? { time_value }
                                : undefined,
                            );
                          }}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          {done ? "Done" : "Mark done"}
                        </button>
                        <button
                          type="button"
                          aria-label={
                            item.faultId ? "View reported fault" : "Report a fault"
                          }
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                            faulty
                              ? "border-amber-500 bg-amber-500/20 text-amber-300"
                              : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-amber-500/50 hover:text-amber-300",
                          )}
                          onClick={() => {
                            if (item.faultId) {
                              router.push(`/faults?open=${item.faultId}`);
                              return;
                            }
                            setFaultItem(item);
                            updateItem(item, "faulty");
                            setFaultOpen(true);
                          }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Mark not done"
                          title="Not done"
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                            notDone
                              ? "border-red-500 bg-red-500/20 text-red-300"
                              : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-red-500/50 hover:text-red-300",
                          )}
                          onClick={() =>
                            updateItem(
                              item,
                              item.response_status === "not_done"
                                ? "pending"
                                : "not_done",
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Mark not applicable"
                          title="Not applicable"
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                            na
                              ? "border-amber-600 bg-amber-500/25 text-amber-800 dark:border-amber-500 dark:text-amber-300"
                              : "border-zinc-800 bg-zinc-900/60 text-amber-700 hover:border-amber-600 hover:bg-amber-500/15 dark:text-amber-500 dark:hover:border-amber-500/60 dark:hover:text-amber-300",
                          )}
                          onClick={() =>
                            updateItem(
                              item,
                              item.response_status === "na" ? "pending" : "na",
                            )
                          }
                        >
                          <CircleMinus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                        {canAddPhotos && (
                          <PhotoTriggerButton
                            sessionId={sessionId}
                            templateItemId={item.id}
                            hasPhotos={(item.photos?.length ?? 0) > 0}
                            onChanged={() => load({ silent: true })}
                          />
                        )}
                      </div>
                    )}

                    {readonly && item.faultId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/faults?open=${item.faultId}`)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> View reported fault
                      </button>
                    )}

                    <ItemPhotos
                      sessionId={sessionId}
                      templateItemId={item.id}
                      photos={item.photos ?? []}
                      faultPhotos={item.faultPhotos ?? []}
                      canEdit={canAddPhotos}
                      showAddButton={false}
                      onChanged={() => load({ silent: true })}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {user?.permissions.approveChecklist && isSubmitted && (
        <div className="space-y-2 border-t border-zinc-800 pt-4">
          <Button className="w-full" onClick={() => setReviewOpen(true)}>
            Review submission
          </Button>
          <p className="text-center text-xs text-zinc-500">
            Approve, copy for WhatsApp, or mark not approved
          </p>
        </div>
      )}

      {/* Spacer so content isn't hidden behind the fixed action bar (desktop). */}
      {showActionBar && <div aria-hidden className="hidden md:block md:h-24" />}

      {showActionBar && (
        <div className="checklist-action-bar">
          <div className="w-full max-w-md md:w-auto md:max-w-none">
            {!isSubmitted && (
              <Button
                className="w-full shadow-lg md:w-auto md:min-w-[680px]"
                onClick={submit}
              >
                Submit checklist
              </Button>
            )}
            {isSubmitted && (
              <div className="flex flex-col items-center gap-2">
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300 backdrop-blur">
                  Submitted — awaiting approval. Edit any item to undo and
                  re-submit.
                </span>
                <Button
                  variant="soft"
                  className="w-full shadow-lg md:w-auto"
                  onClick={notifyApprover}
                >
                  Notify front desk via WhatsApp
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <FaultCaptureSheet
        open={faultOpen}
        onClose={() => setFaultOpen(false)}
        sessionId={sessionId}
        itemResponseId={faultItem?.response_id ?? null}
        itemTitle={faultItem?.item_text ?? ""}
        vendors={vendors}
        onSaved={load}
      />

      <ReviewChecklistModal
        open={reviewOpen}
        sessionId={sessionId}
        onClose={() => setReviewOpen(false)}
        onResolved={() => {
          setReviewOpen(false);
          router.push("/");
        }}
      />
    </div>
  );
}

function ResponseCredit({
  status,
  name,
  at,
}: {
  status: string;
  name: string;
  at: string | null;
}) {
  const verb =
    status === "checked"
      ? "Marked done"
      : status === "faulty"
        ? "Reported fault"
        : status === "not_done"
          ? "Marked not done"
          : status === "na"
            ? "Marked N/A"
            : "Updated";
  const dotClass =
    status === "checked"
      ? "bg-accent-500"
      : status === "faulty"
        ? "bg-amber-500"
        : status === "not_done"
          ? "bg-red-500"
          : status === "na"
            ? "bg-amber-600"
            : "bg-zinc-600";

  return (
    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
      <span>
        {verb} by <span className="text-zinc-300">{name}</span>
        {at ? <span className="text-zinc-600"> · {timeAgo(at)}</span> : null}
      </span>
    </p>
  );
}

function StatusDot({ status }: { status: string | null }) {
  const cls =
    status === "checked"
      ? "bg-accent-500 ring-accent-500/30"
      : status === "faulty"
        ? "bg-amber-500 ring-amber-500/30"
        : status === "not_done"
          ? "bg-red-500 ring-red-500/30"
          : status === "na"
            ? "bg-amber-600 ring-amber-600/30"
            : "bg-zinc-700 ring-zinc-700/30";
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ring-4 transition-colors",
        cls,
      )}
    />
  );
}

function PhotoTriggerButton({
  sessionId,
  templateItemId,
  hasPhotos,
  onChanged,
}: {
  sessionId: string;
  templateItemId: string | number;
  hasPhotos: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const upload = async (files: FileList) => {
    if (files.length === 0) return;
    setUploading(true);
    const form = new FormData();
    form.append("sessionId", sessionId);
    form.append("templateItemId", String(templateItemId));
    Array.from(files)
      .slice(0, 5)
      .forEach((f, i) => form.append(`photo${i}`, f));
    try {
      const res = await fetch("/api/checklists/items/photos", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not upload photo");
      } else {
        onChanged();
      }
    } catch {
      toast.error("Could not upload photo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <button
        type="button"
        aria-label={hasPhotos ? "Add more photos" : "Add photo"}
        title={hasPhotos ? "Add more photos" : "Add photo"}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:opacity-50",
          hasPhotos
            ? "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-sky-500/40 hover:text-sky-300",
        )}
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
      </button>
    </>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 45_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
