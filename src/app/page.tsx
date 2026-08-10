"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/fetch";
import { DaySlider } from "@/components/dashboard/day-slider";
import { Card, CardContent, Badge } from "@/components/ui/card";
import Link from "next/link";
import { DashboardSkeleton } from "@/components/loading/page-skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { LiveActivityBanner } from "@/components/dashboard/live-activity-banner";
import { useRealtimeRefresh } from "@/providers/realtime-provider";
import { statusColor, cn } from "@/lib/utils";
import {
  CAROUSEL_SLIDE_CLASS,
  HorizontalCarousel,
} from "@/components/ui/horizontal-carousel";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock,
} from "lucide-react";

interface ChecklistRow {
  slug: string;
  label: string;
  status: string;
  frequency: string;
  sessionId: string | number | null;
  canComplete: boolean;
  progress: {
    total: number;
    completed: number;
    faulty: number;
    na?: number;
  } | null;
}

interface UpcomingConference {
  id: number;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  guest_count: number | null;
  created_at?: string;
  checklistProgress?: {
    total: number;
    approved: number;
    submitted: number;
    inProgress: number;
  };
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [checklists, setChecklists] = useState<ChecklistRow[]>([]);
  const [upcomingConferences, setUpcomingConferences] = useState<
    UpcomingConference[]
  >([]);
  const [today, setToday] = useState(localToday());
  const [selected, setSelected] = useState(localToday());
  const [openFaults, setOpenFaults] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isToday = selected === today;

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/checklists?date=${selected}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const all = (data.checklists ?? []) as ChecklistRow[];
        setChecklists(all.filter((c) => c.frequency === "daily"));
        if (data.today) setToday(data.today);
        setLoadError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setLoadError(err.error ?? "Could not load dashboard");
      }

      try {
        const cr = await apiFetch("/api/conferences");
        if (cr.ok) {
          const cd = (await cr.json()) as { conferences?: UpcomingConference[] };
          setUpcomingConferences(
            sortUpcomingConferences(
              (cd.conferences ?? []).filter(
                (c) => c.status === "Planning" || c.status === "Active",
              ),
            ),
          );
        }
      } catch {
        /* non-fatal */
      }

      if (user?.permissions.viewReports) {
        const r = await apiFetch("/api/reports");
        if (r.ok) {
          const d = await r.json();
          setOpenFaults(d.openFaults ?? 0);
        }
      } else {
        const r = await apiFetch("/api/faults");
        if (r.ok) {
          const d = await r.json();
          const faults: Array<{ status?: string }> = d.faults ?? [];
          setOpenFaults(
            faults.filter(
              (f) => f.status !== "resolved" && f.status !== "closed",
            ).length,
          );
        }
      }
    } catch {
      setLoadError("Network error — check your connection");
    } finally {
      setReady(true);
    }
  }, [user, router, selected]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    useCallback(() => {
      if (isToday) load();
    }, [isToday, load]),
  );

  const dailyPulse = useMemo(() => summarizeDaily(checklists), [checklists]);
  const conferencePulse = useMemo(
    () => summarizeConferences(upcomingConferences),
    [upcomingConferences],
  );

  const pendingApproval = dailyPulse.submitted;
  const mineNeedingWork = checklists.filter(
    (c) =>
      c.canComplete &&
      c.status !== "approved" &&
      c.status !== "submitted",
  ).length;

  if (!ready) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {loadError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => {
              setReady(false);
              load();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <PageHeader
        title="Dashboard"
        description={user?.display_name ?? user?.username ?? ""}
        belowTitle={
          isToday ? (
            <LiveActivityBanner
              pendingApproval={pendingApproval}
              openFaults={openFaults}
            />
          ) : undefined
        }
      />

      <DaySlider selected={selected} today={today} onSelect={setSelected} />

      {isToday && (
        <>
          {upcomingConferences.length > 0 ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-zinc-200">
                    Upcoming conferences
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {conferencePulse.approved}/{conferencePulse.total}{" "}
                    conference checklists approved
                    {conferencePulse.live > 0
                      ? ` · ${conferencePulse.live} live now`
                      : ""}
                  </p>
                </div>
                {user?.permissions.initiateConference && (
                  <Link
                    href="/conferences"
                    className="shrink-0 text-xs text-accent-400 hover:underline"
                  >
                    Manage →
                  </Link>
                )}
              </div>
              <HorizontalCarousel
                itemCount={upcomingConferences.length}
                prevLabel="Previous conferences"
                nextLabel="Next conferences"
              >
                {upcomingConferences.map((c) => (
                  <div key={c.id} className={CAROUSEL_SLIDE_CLASS}>
                    <UpcomingConferenceCard conference={c} />
                  </div>
                ))}
              </HorizontalCarousel>
            </section>
          ) : (
            user?.permissions.initiateConference && (
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      No upcoming conferences
                    </p>
                    <p className="text-xs text-zinc-500">
                      Plan an event to auto-activate its checklists.
                    </p>
                  </div>
                  <Link
                    href="/conferences"
                    className="text-sm text-accent-400 hover:underline"
                  >
                    Plan one →
                  </Link>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}

      <DailyOpsPulse
        pulse={dailyPulse}
        openFaults={openFaults}
        isToday={isToday}
        mineNeedingWork={mineNeedingWork}
      />
    </div>
  );
}

function summarizeDaily(rows: ChecklistRow[]) {
  let itemsTotal = 0;
  let itemsCompleted = 0;
  let itemsNa = 0;
  let itemFaults = 0;
  let approved = 0;
  let submitted = 0;
  let inProgress = 0;
  let notStarted = 0;
  let rejected = 0;

  for (const r of rows) {
    itemsTotal += r.progress?.total ?? 0;
    itemsCompleted += r.progress?.completed ?? 0;
    itemsNa += r.progress?.na ?? 0;
    itemFaults += r.progress?.faulty ?? 0;
    switch (r.status) {
      case "approved":
        approved += 1;
        break;
      case "submitted":
        submitted += 1;
        break;
      case "in_progress":
        inProgress += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
      default:
        notStarted += 1;
    }
  }

  const addressed = itemsCompleted + itemsNa;
  const itemPct =
    itemsTotal > 0 ? Math.round((addressed / itemsTotal) * 100) : 0;
  const checklistPct =
    rows.length > 0 ? Math.round((approved / rows.length) * 100) : 0;

  return {
    total: rows.length,
    approved,
    submitted,
    inProgress,
    notStarted,
    rejected,
    itemsTotal,
    itemsCompleted,
    itemsNa,
    itemFaults,
    itemPct,
    checklistPct,
  };
}

function summarizeConferences(conferences: UpcomingConference[]) {
  let total = 0;
  let approved = 0;
  let live = 0;
  for (const c of conferences) {
    const p = c.checklistProgress;
    total += p?.total ?? 0;
    approved += p?.approved ?? 0;
    if (describeCountdown(c.start_date, c.end_date) === "Live now") live += 1;
  }
  return { total, approved, live };
}

function DailyOpsPulse({
  pulse,
  openFaults,
  isToday,
  mineNeedingWork,
}: {
  pulse: ReturnType<typeof summarizeDaily>;
  openFaults: number;
  isToday: boolean;
  mineNeedingWork: number;
}) {
  const title = isToday ? "Daily operations" : "Day overview";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold text-zinc-200">{title}</h2>
        <Link
          href="/checklists"
          className="text-xs text-accent-400 hover:underline"
        >
          Open checklists →
        </Link>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="space-y-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Overall daily progress
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
                {pulse.checklistPct}%
                <span className="ml-2 text-sm font-normal text-zinc-500">
                  checklists approved
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {pulse.approved}/{pulse.total} departments signed off
                {pulse.itemsTotal > 0 && (
                  <>
                    {" · "}
                    {pulse.itemsCompleted + pulse.itemsNa}/{pulse.itemsTotal}{" "}
                    items addressed
                  </>
                )}
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent-500/25 bg-accent-500/10 text-accent-300">
              <ClipboardList className="h-6 w-6" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Item completion</span>
              <span>{pulse.itemPct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pulse.itemPct >= 100 ? "bg-emerald-500" : "bg-accent-500",
                )}
                style={{ width: `${pulse.itemPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PulseStat
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Approved"
              value={pulse.approved}
              tone="emerald"
            />
            <PulseStat
              icon={<Clock className="h-3.5 w-3.5" />}
              label="In progress"
              value={pulse.inProgress}
              tone="sky"
            />
            <PulseStat
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Awaiting"
              value={pulse.submitted}
              tone="amber"
            />
            <PulseStat
              icon={<CircleDashed className="h-3.5 w-3.5" />}
              label="Not started"
              value={pulse.notStarted}
              tone="zinc"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-4 text-xs">
            <Link
              href="/faults"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                openFaults > 0 || pulse.itemFaults > 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {openFaults} open fault{openFaults === 1 ? "" : "s"}
              {pulse.itemFaults > 0 && ` · ${pulse.itemFaults} on this day`}
            </Link>
            {pulse.rejected > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-rose-300">
                {pulse.rejected} rejected
              </span>
            )}
            {isToday && mineNeedingWork > 0 && (
              <Link
                href="/checklists"
                className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/30 bg-accent-500/10 px-2.5 py-1 text-accent-300 hover:bg-accent-500/15"
              >
                {mineNeedingWork} of yours need work
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function PulseStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber" | "zinc";
}) {
  const tones = {
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-300",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    zinc: "border-zinc-700 bg-zinc-900/60 text-zinc-300",
  };
  return (
    <div className={cn("rounded-2xl border px-3 py-2.5", tones[tone])}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
}

function UpcomingConferenceCard({
  conference: c,
}: {
  conference: UpcomingConference;
}) {
  const progress = c.checklistProgress ?? {
    total: 0,
    approved: 0,
    submitted: 0,
    inProgress: 0,
  };
  const total = progress.total;
  const percent = total > 0 ? Math.round((progress.approved / total) * 100) : 0;
  const isReady = total > 0 && progress.approved === total;
  const countdown = describeCountdown(c.start_date, c.end_date);
  const live = countdown === "Live now";
  const start = new Date(c.start_date);
  const startMonth = isNaN(start.getTime())
    ? ""
    : start.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const startDay = isNaN(start.getTime()) ? "" : String(start.getDate());

  return (
    <Link href={`/conferences/${c.id}`} className="block h-full">
      <Card
        className={cn(
          "h-full overflow-hidden transition-colors",
          live
            ? "border-accent-500/50 bg-gradient-to-br from-accent-500/10 to-transparent hover:border-accent-500/70"
            : "hover:border-zinc-700",
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-accent-500/25 bg-accent-500/10 leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-300">
                {startMonth}
              </span>
              <span className="text-lg font-bold text-zinc-100">
                {startDay}
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="truncate font-medium text-zinc-100">{c.name}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  className={cn(
                    "border text-[10px]",
                    statusColor(c.status.toLowerCase()),
                  )}
                >
                  {c.status}
                </Badge>
                {countdown && (
                  <Badge
                    className={cn(
                      "border text-[10px]",
                      live
                        ? "border-accent-500/40 bg-accent-500/15 text-accent-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400",
                    )}
                  >
                    {countdown}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            {formatConfDateRange(c.start_date, c.end_date)}
            {c.guest_count ? ` · ${c.guest_count} guests` : ""}
          </p>

          {total > 0 && (
            <div className="mt-auto space-y-1.5 pt-1">
              {isReady ? (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Checklist Status: Completed and Ready
                  </span>
                  <span className="font-semibold text-emerald-400">100%</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    Checklists{" "}
                    <span className="text-zinc-300">
                      {progress.approved}/{total}
                    </span>
                    {progress.submitted > 0 && (
                      <span className="text-zinc-500">
                        {" · "}
                        {progress.submitted} awaiting approval
                      </span>
                    )}
                    {progress.inProgress > 0 && (
                      <span className="text-zinc-500">
                        {" · "}
                        {progress.inProgress} in progress
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-400">{percent}%</span>
                </div>
              )}
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isReady ? "bg-emerald-500" : "bg-accent-500",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/** Newest conferences first (by created_at, then id). */
function sortUpcomingConferences(
  conferences: UpcomingConference[],
): UpcomingConference[] {
  return [...conferences].sort((a, b) => {
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca && cb && ca !== cb) return cb.localeCompare(ca);
    return b.id - a.id;
  });
}

function isConferenceLive(start: string, end: string): boolean {
  const now = new Date();
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  now.setHours(0, 0, 0, 0);
  const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  return now.getTime() >= startDay.getTime() && now.getTime() <= endDay.getTime();
}

function describeCountdown(start: string, end: string): string | null {
  const now = new Date();
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  now.setHours(0, 0, 0, 0);
  const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const dayMs = 86400000;
  const daysToStart = Math.round((startDay.getTime() - now.getTime()) / dayMs);
  if (daysToStart > 0) {
    if (daysToStart === 1) return "Starts tomorrow";
    if (daysToStart <= 14) return `In ${daysToStart} days`;
    return `In ${Math.ceil(daysToStart / 7)} weeks`;
  }
  if (isConferenceLive(start, end)) {
    return "Live now";
  }
  return null;
}

function formatConfDateRange(start: string, end: string): string {
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
