"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/providers/realtime-provider";
import { apiFetch } from "@/lib/fetch";
import { useToast } from "@/providers/toast-provider";
import { checklistHref } from "@/lib/checklist-slugs";
import { ChecklistStatusCard } from "@/components/dashboard/checklist-status-card";
import { ConferenceTile } from "@/components/dashboard/conference-tile";
import { DailyChecklistTile } from "@/components/dashboard/daily-checklist-tile";
import { PageHeader } from "@/components/layout/page-header";
import {
  ChecklistCardsSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading/page-skeletons";
import {
  CAROUSEL_SLIDE_CLASS,
  HorizontalCarousel,
} from "@/components/ui/horizontal-carousel";
import { Modal } from "@/components/settings/settings-ui";

interface Row {
  slug: string;
  label: string;
  status: string;
  sessionId: string | number | null;
  canComplete: boolean;
  progress: {
    total: number;
    completed: number;
    faulty: number;
    na?: number;
  } | null;
  frequency: string;
  conferenceId?: number | null;
  conferenceName?: string | null;
  conferenceStatus?: string | null;
  conferenceStartDate?: string | null;
  conferenceEndDate?: string | null;
}

interface ConferenceGroup {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  rows: Row[];
}

export default function ChecklistsPage() {
  const router = useRouter();
  const toast = useToast();
  const [checklists, setChecklists] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [modalConferenceId, setModalConferenceId] = useState<number | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/checklists");
      if (r.ok) {
        const d = await r.json();
        setChecklists(d.checklists ?? []);
      }
    } catch {
      /* keep list */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: fires on every checklist.* / fault.* event so conference
  // progress bars update as staff work through their items.
  useRealtimeRefresh(load);

  const start = async (slug: string, conferenceId?: number | null) => {
    try {
      const res = await apiFetch("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          ...(conferenceId != null ? { conferenceId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not open checklist");
        return;
      }
      const data = await res.json();
      if (!data.session?.id) {
        toast.error("Could not start checklist");
        return;
      }
      router.push(
        checklistHref(data.session.checklist_type_slug ?? slug, data.session.id),
      );
    } catch {
      toast.error("Connection lost — try again");
    }
  };

  const { conferenceGroups, dailyRows } = useMemo(
    () => groupChecklists(checklists),
    [checklists],
  );

  // Keep modal conference in sync if the group disappears after a refresh.
  useEffect(() => {
    if (modalConferenceId == null) return;
    if (!conferenceGroups.some((g) => g.id === modalConferenceId)) {
      setModalConferenceId(null);
    }
  }, [conferenceGroups, modalConferenceId]);

  const modalGroup =
    conferenceGroups.find((g) => g.id === modalConferenceId) ?? null;

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <ChecklistCardsSkeleton count={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Checklists" />

      {conferenceGroups.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Conference Checklists
            </h2>
            <span className="text-[11px] text-zinc-600">
              {conferenceGroups.length} total
            </span>
          </div>

          <ConferenceCarousel
            groups={conferenceGroups}
            selectedId={modalConferenceId}
            onSelect={setModalConferenceId}
          />
        </section>
      )}

      <Modal
        open={modalGroup != null}
        onClose={() => setModalConferenceId(null)}
        title={modalGroup?.name ?? "Conference"}
        description={
          modalGroup
            ? `${modalGroup.rows.length} checklist${modalGroup.rows.length === 1 ? "" : "s"} · tap one to open`
            : undefined
        }
        size="lg"
        footer={
          modalGroup ? (
            <Link
              href={`/conferences/${modalGroup.id}`}
              className="text-sm text-accent-400 hover:underline"
              onClick={() => setModalConferenceId(null)}
            >
              View conference →
            </Link>
          ) : null
        }
      >
        {modalGroup && (
          <div className="flex flex-col gap-3">
            {modalGroup.rows.map((c) => (
              <ChecklistStatusCard
                key={`${c.slug}-${c.conferenceId}`}
                {...c}
                onStart={() => {
                  setModalConferenceId(null);
                  start(c.slug, c.conferenceId);
                }}
              />
            ))}
            {modalGroup.rows.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500">
                No open checklists for this conference.
              </p>
            )}
          </div>
        )}
      </Modal>

      {dailyRows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Daily checklists
            </h2>
            <span className="text-[11px] text-zinc-600">
              {dailyRows.length} total
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dailyRows.map((c, i) => (
              <DailyChecklistTile
                key={c.slug}
                {...c}
                index={i + 1}
                onStart={() => start(c.slug)}
              />
            ))}
          </div>
        </section>
      )}

      {conferenceGroups.length === 0 && dailyRows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
          No checklists yet.
        </div>
      )}
    </div>
  );
}

function ConferenceCarousel({
  groups,
  selectedId,
  onSelect,
}: {
  groups: ConferenceGroup[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <HorizontalCarousel
      itemCount={groups.length}
      prevLabel="Previous conferences"
      nextLabel="Next conferences"
    >
      {groups.map((group, i) => {
        const totals = group.rows.reduce(
          (acc, r) => {
            acc.total += r.progress?.total ?? 0;
            acc.completed += r.progress?.completed ?? 0;
            return acc;
          },
          { total: 0, completed: 0 },
        );
        const approvedCount = group.rows.filter(
          (r) => r.status === "approved",
        ).length;

        return (
          <div key={group.id} className={CAROUSEL_SLIDE_CLASS}>
            <ConferenceTile
              name={group.name}
              status={group.status}
              startDate={group.startDate}
              endDate={group.endDate}
              index={i + 1}
              checklistCount={group.rows.length}
              approvedCount={approvedCount}
              itemsCompleted={totals.completed}
              itemsTotal={totals.total}
              selected={selectedId === group.id}
              onSelect={() => onSelect(group.id)}
            />
          </div>
        );
      })}
    </HorizontalCarousel>
  );
}

function groupChecklists(rows: Row[]): {
  conferenceGroups: ConferenceGroup[];
  dailyRows: Row[];
} {
  const map = new Map<number, ConferenceGroup>();
  const dailyRows: Row[] = [];
  for (const r of rows) {
    if (r.conferenceId != null && r.conferenceName && r.conferenceStartDate) {
      const existing = map.get(r.conferenceId);
      if (existing) {
        existing.rows.push(r);
        existing.rows.sort(
          (a, b) => conferenceChecklistRank(a.slug) - conferenceChecklistRank(b.slug),
        );
      } else {
        map.set(r.conferenceId, {
          id: r.conferenceId,
          name: r.conferenceName,
          status: r.conferenceStatus ?? "Planning",
          startDate: r.conferenceStartDate,
          endDate: r.conferenceEndDate ?? r.conferenceStartDate,
          rows: [r],
        });
      }
    } else {
      dailyRows.push(r);
    }
  }
  const conferenceGroups = Array.from(map.values()).sort((a, b) => {
    const rankA = conferenceUrgencyRank(a.status, a.startDate, a.endDate);
    const rankB = conferenceUrgencyRank(b.status, b.startDate, b.endDate);
    if (rankA !== rankB) return rankA - rankB;
    return a.startDate.localeCompare(b.startDate);
  });
  return { conferenceGroups, dailyRows };
}

/** 0 = active/live now, 1 = upcoming / other. */
function conferenceUrgencyRank(
  status: string,
  start: string,
  end: string,
): number {
  if (status === "Active" || isConferenceLive(start, end)) return 0;
  return 1;
}

function conferenceChecklistRank(slug: string): number {
  const order: Record<string, number> = {
    operational: 1,
    facility: 2,
    kitchen: 3,
    cyberbar: 4,
    frontdesk: 5,
    "pre-conference": 6,
    "conference-it": 7,
  };
  return order[slug] ?? 50;
}

function isConferenceLive(start: string, end: string): boolean {
  const now = new Date();
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  now.setHours(0, 0, 0, 0);
  const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  return (
    now.getTime() >= startDay.getTime() && now.getTime() <= endDay.getTime()
  );
}
