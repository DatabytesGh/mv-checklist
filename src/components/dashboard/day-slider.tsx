"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

interface Props {
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}

export function DaySlider({ selected, today, onSelect }: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => fromKey(selected));

  const selectedDate = fromKey(selected);
  const isToday = selected === today;

  // Build a 7-day strip ending on the selected day so the active day is rightmost-ish but centered.
  const weekStrip = useMemo(() => {
    const days: string[] = [];
    for (let i = -3; i <= 3; i++) {
      days.push(addDays(selected, i));
    }
    return days;
  }, [selected]);

  const headline = isToday
    ? "Today"
    : selected === addDays(today, -1)
      ? "Yesterday"
      : selectedDate.toLocaleDateString(undefined, { weekday: "long" });

  const subline = `${DOW_SHORT[selectedDate.getDay()]}, ${
    MONTHS[selectedDate.getMonth()]
  } ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  const canGoForward = selected < today;

  // Calendar grid for the visible month
  const calCells = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(
      calMonth.getFullYear(),
      calMonth.getMonth() + 1,
      0,
    ).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(toKey(new Date(calMonth.getFullYear(), calMonth.getMonth(), d)));
    }
    return cells;
  }, [calMonth]);

  const monthForward =
    `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 2).padStart(2, "0")}` <=
    today.slice(0, 7);

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/80 to-zinc-950/60 p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => onSelect(addDays(selected, -1))}
          className="tap-target flex h-16 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-700 text-zinc-300 transition-colors hover:border-accent-500 hover:text-accent-300"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setCalMonth(fromKey(selected));
            setCalOpen((o) => !o);
          }}
          className="flex min-h-16 flex-1 flex-col items-center justify-center"
        >
          <span className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-50">
            {headline}
            <CalendarDays className="h-4 w-4 text-zinc-500" />
          </span>
          <span className="text-xs text-zinc-400">{subline}</span>
        </button>

        <button
          type="button"
          aria-label="Next day"
          disabled={!canGoForward}
          onClick={() => canGoForward && onSelect(addDays(selected, 1))}
          className={cn(
            "tap-target flex h-16 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors",
            canGoForward
              ? "border-zinc-700 text-zinc-300 hover:border-accent-500 hover:text-accent-300"
              : "cursor-not-allowed border-zinc-800 text-zinc-700",
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Week strip */}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {weekStrip.map((key) => {
          const d = fromKey(key);
          const future = key > today;
          const active = key === selected;
          const dayIsToday = key === today;
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              onClick={() => !future && onSelect(key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl py-2 transition-all",
                active
                  ? "bg-accent-500 text-zinc-950 shadow-lg shadow-accent-500/20"
                  : future
                    ? "cursor-not-allowed text-zinc-700"
                    : "text-zinc-400 hover:bg-zinc-800/80",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium uppercase",
                  active ? "text-zinc-900" : "",
                )}
              >
                {DOW_SHORT[d.getDay()]}
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  active
                    ? "text-zinc-950"
                    : dayIsToday
                      ? "border border-accent-500/60 text-accent-300"
                      : "",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Calendar popover */}
      {calOpen && (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setCalMonth(
                  new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1),
                )
              }
              className="tap-target flex h-12 w-11 items-center justify-center rounded-xl border border-zinc-700 text-zinc-300 hover:border-zinc-500"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-zinc-100">
              {MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={!monthForward}
              onClick={() =>
                monthForward &&
                setCalMonth(
                  new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1),
                )
              }
              className={cn(
                "tap-target flex h-12 w-11 items-center justify-center rounded-xl border",
                monthForward
                  ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  : "cursor-not-allowed border-zinc-800 text-zinc-700",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-zinc-600">
            {DOW_SHORT.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calCells.map((key, i) => {
              if (!key) return <span key={`pad-${i}`} />;
              const future = key > today;
              const active = key === selected;
              const dayIsToday = key === today;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={future}
                  onClick={() => {
                    onSelect(key);
                    setCalOpen(false);
                  }}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg text-sm transition-colors",
                    active
                      ? "bg-accent-500 font-semibold text-zinc-950"
                      : future
                        ? "cursor-not-allowed text-zinc-700"
                        : dayIsToday
                          ? "border border-accent-500/50 text-accent-300 hover:bg-zinc-800"
                          : "text-zinc-300 hover:bg-zinc-800",
                  )}
                >
                  {fromKey(key).getDate()}
                </button>
              );
            })}
          </div>

          {!isToday && (
            <button
              type="button"
              onClick={() => {
                onSelect(today);
                setCalOpen(false);
              }}
              className="mt-3 w-full rounded-xl border border-accent-500/40 bg-accent-500/10 py-2 text-sm font-medium text-accent-300 hover:bg-accent-500/20"
            >
              Jump to today
            </button>
          )}
        </div>
      )}
    </div>
  );
}
