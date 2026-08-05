"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { checklistHref } from "@/lib/checklist-slugs";

interface Props {
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
  index: number;
  onStart: () => void;
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

// Tailwind classes are written out so the JIT can see them.
// The `tag` text uses a dark shade in light mode and a light shade in dark mode
// because the color scales (sky, violet, …) are NOT mirrored by our theme.
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
    // Zinc IS mirrored by the theme, so text-zinc-300 renders as
    // a dark grey (#3f3f46) in light mode and a light grey in dark mode.
    tag: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
    dot: "bg-zinc-500",
    bar: "bg-zinc-500",
    glow: "from-zinc-500/5",
  },
};

const SLUG_META: Record<string, { label: string; tone: Tone }> = {
  frontdesk: { label: "Front Desk", tone: "sky" },
  housekeeping: { label: "Housekeeping", tone: "violet" },
  cyberbar: { label: "Cyber Bar", tone: "pink" },
  kitchen: { label: "Kitchen", tone: "orange" },
  laundry: { label: "Laundry", tone: "teal" },
  facility: { label: "Facility", tone: "emerald" },
  security: { label: "Security", tone: "emerald" },
  "social-media": { label: "Marketing", tone: "rose" },
  "pre-conference": { label: "Pre-Conference", tone: "amber" },
  operational: { label: "Operational", tone: "teal" },
  "conference-it": { label: "Conference IT", tone: "indigo" },
};

function metaFor(slug: string): { label: string; tone: Tone } {
  const s = slug.toLowerCase();
  if (SLUG_META[s]) return SLUG_META[s];
  for (const key of Object.keys(SLUG_META)) {
    if (s.startsWith(`${key}-`) || s.startsWith(`${key}_`)) return SLUG_META[key];
  }
  return { label: "Ops", tone: "zinc" };
}

function statusTone(status: string): Tone {
  switch (status) {
    case "approved":
      return "emerald";
    case "submitted":
      return "amber";
    case "rejected":
      return "rose";
    case "in_progress":
      return "sky";
    default:
      return "zinc";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "not_started":
      return "Not started";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function DailyChecklistTile({
  slug,
  label,
  status,
  sessionId,
  canComplete,
  progress,
  index,
  onStart,
}: Props) {
  const meta = metaFor(slug);
  const tone = TONE[meta.tone];
  const sTone = TONE[statusTone(status)];

  const total = progress?.total ?? 0;
  const done = progress?.completed ?? 0;
  const na = progress?.na ?? 0;
  const faulty = progress?.faulty ?? 0;
  const addressed = done + na;
  const pct = total > 0 ? Math.round((addressed / total) * 100) : 0;

  const validSessionId =
    sessionId != null && sessionId !== "null" && String(sessionId).trim() !== "";
  const href = validSessionId ? checklistHref(slug, sessionId) : undefined;

  const content = (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3.5 shadow-md transition-all",
        "hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-lg",
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
          {meta.label}
        </span>
        <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-zinc-500">
          {String(index).padStart(2, "0")}
        </span>
      </div>

      <h3 className="relative mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100">
        {label}
      </h3>

      <div className="relative mt-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              sTone.tag,
            )}
          >
            <span className={cn("h-1 w-1 rounded-full", sTone.dot)} />
            {statusLabel(status)}
          </span>
          {total > 0 ? (
            <span className="font-mono text-[10px] text-zinc-500">
              {addressed}/{total}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-600">—</span>
          )}
        </div>
        {total > 0 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn("h-full rounded-full transition-all", tone.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="relative mt-2.5 flex items-center justify-between text-[11px]">
        {faulty > 0 ? (
          <span className="text-amber-400">
            {faulty} fault{faulty === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-zinc-500">
            {status === "approved"
              ? "Approved"
              : status === "not_started" ||
                  (addressed === 0 &&
                    status !== "submitted" &&
                    status !== "rejected")
                ? canComplete
                  ? "Ready to start"
                  : "View only"
                : `${pct}% complete`}
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  if (canComplete) {
    return (
      <button type="button" className="block h-full w-full text-left" onClick={onStart}>
        {content}
      </button>
    );
  }
  return <div className="block h-full">{content}</div>;
}
