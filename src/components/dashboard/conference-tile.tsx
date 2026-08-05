"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  index: number;
  checklistCount: number;
  approvedCount: number;
  itemsCompleted: number;
  itemsTotal: number;
  selected?: boolean;
  onSelect: () => void;
}

type Tone =
  | "sky"
  | "violet"
  | "pink"
  | "orange"
  | "teal"
  | "emerald"
  | "rose"
  | "amber"
  | "indigo"
  | "zinc";

const TONE: Record<
  Tone,
  { tag: string; dot: string; bar: string; glow: string }
> = {
  sky: {
    tag: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
    dot: "bg-sky-500 dark:bg-sky-400",
    bar: "bg-sky-500",
    glow: "from-sky-500/10",
  },
  violet: {
    tag: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
    dot: "bg-violet-500 dark:bg-violet-400",
    bar: "bg-violet-500",
    glow: "from-violet-500/10",
  },
  pink: {
    tag: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-200",
    dot: "bg-pink-500 dark:bg-pink-400",
    bar: "bg-pink-500",
    glow: "from-pink-500/10",
  },
  orange: {
    tag: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-200",
    dot: "bg-orange-500 dark:bg-orange-400",
    bar: "bg-orange-500",
    glow: "from-orange-500/10",
  },
  teal: {
    tag: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-200",
    dot: "bg-teal-500 dark:bg-teal-400",
    bar: "bg-teal-500",
    glow: "from-teal-500/10",
  },
  emerald: {
    tag: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    bar: "bg-emerald-500",
    glow: "from-emerald-500/10",
  },
  rose: {
    tag: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
    dot: "bg-rose-500 dark:bg-rose-400",
    bar: "bg-rose-500",
    glow: "from-rose-500/10",
  },
  amber: {
    tag: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    dot: "bg-amber-500 dark:bg-amber-400",
    bar: "bg-amber-500",
    glow: "from-amber-500/10",
  },
  indigo: {
    tag: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    bar: "bg-indigo-500",
    glow: "from-indigo-500/10",
  },
  zinc: {
    tag: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
    dot: "bg-zinc-500",
    bar: "bg-zinc-500",
    glow: "from-zinc-500/5",
  },
};

function statusTone(status: string): Tone {
  switch (status.toLowerCase()) {
    case "active":
      return "emerald";
    case "planning":
      return "sky";
    case "completed":
      return "violet";
    case "cancelled":
      return "rose";
    default:
      return "zinc";
  }
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
  if (now.getTime() >= startDay.getTime() && now.getTime() <= endDay.getTime()) {
    return "Live now";
  }
  return null;
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

export function ConferenceTile({
  name,
  status,
  startDate,
  endDate,
  index,
  checklistCount,
  approvedCount,
  itemsCompleted,
  itemsTotal,
  selected = false,
  onSelect,
}: Props) {
  const tone = TONE[statusTone(status)];
  const countdown = describeCountdown(startDate, endDate);
  const pct =
    itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="block h-full w-full text-left"
    >
      <div
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-zinc-950/80 p-3.5 shadow-md transition-all",
          "hover:-translate-y-0.5 hover:shadow-lg",
          selected
            ? "border-accent-500/60 ring-1 ring-accent-500/30"
            : "border-zinc-800/80 hover:border-zinc-700",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent opacity-70",
            tone.glow,
          )}
        />

        <div className="relative flex items-center justify-between">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              tone.tag,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
            {status}
          </span>
          <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-zinc-500">
            {String(index).padStart(2, "0")}
          </span>
        </div>

        <h3 className="relative mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100">
          {name}
        </h3>

        <div className="relative mt-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px]">
            {countdown ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-200">
                <span className="h-1 w-1 rounded-full bg-accent-500" />
                {countdown}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500">
                {formatDateRange(startDate, endDate)}
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-500">
              {approvedCount}/{checklistCount}
            </span>
          </div>
          {itemsTotal > 0 && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn("h-full rounded-full transition-all", tone.bar)}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="relative mt-2.5 flex items-center justify-between text-[11px]">
          <span className="truncate text-zinc-500">
            {itemsTotal > 0
              ? `${itemsCompleted}/${itemsTotal} items · ${pct}%`
              : `${checklistCount} checklist${checklistCount === 1 ? "" : "s"}`}
          </span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5",
              selected ? "text-accent-400" : "text-zinc-600 group-hover:text-zinc-400",
            )}
          />
        </div>
      </div>
    </button>
  );
}
