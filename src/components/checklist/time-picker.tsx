"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, Clock3, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatNow,
  formatTimeParts,
  parseTime,
  partsFromDate,
  type TimeParts,
} from "@/lib/time-format";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (time: string) => void;
  className?: string;
};

type MenuPos = { top: number; left: number; width: number; openUp: boolean };

function nearestMinuteOption(minute: number): number {
  return (Math.round(minute / 5) * 5) % 60;
}

export function TimePicker({ value, disabled, onChange, className }: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const seededRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<TimeParts>(() => {
    return parseTime(value) ?? partsFromDate(new Date());
  });

  onChangeRef.current = onChange;

  useEffect(() => setMounted(true), []);

  // Default every empty time field to the current clock time.
  useEffect(() => {
    if (disabled || seededRef.current) return;
    if (value?.trim()) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    onChangeRef.current(formatNow());
  }, [disabled, value]);

  useEffect(() => {
    const parsed = parseTime(value);
    if (parsed) setDraft(parsed);
  }, [value]);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 260;
    const gap = 6;
    const menuH = 280;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const openUp = spaceBelow < menuH && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - gap : r.bottom + gap,
      left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePos();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (parts: TimeParts) => {
    setDraft(parts);
    onChange(formatTimeParts(parts));
  };

  const display = value?.trim() || formatTimeParts(draft);

  const menu =
    mounted &&
    open &&
    pos &&
    createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="dialog"
        aria-label="Pick time"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: 100,
          transform: pos.openUp ? "translateY(-100%)" : undefined,
        }}
        className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Time
            </p>
            <p className="text-lg font-semibold tabular-nums text-zinc-50">
              {formatTimeParts(draft)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => commit(partsFromDate(new Date()))}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:border-accent-500/40 hover:text-accent-300"
          >
            <RotateCcw className="h-3 w-3" />
            Now
          </button>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-3">
          <WheelColumn
            label="Hour"
            values={HOURS}
            selected={draft.hour12}
            onSelect={(hour12) => commit({ ...draft, hour12 })}
          />
          <WheelColumn
            label="Min"
            values={MINUTES}
            selected={nearestMinuteOption(draft.minute)}
            format={(n) => String(n).padStart(2, "0")}
            onSelect={(minute) => commit({ ...draft, minute })}
          />
          <div className="flex flex-col gap-1.5 pt-5">
            {(["AM", "PM"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => commit({ ...draft, period })}
                className={cn(
                  "flex h-10 w-12 items-center justify-center rounded-xl border text-xs font-semibold transition-colors",
                  draft.period === period
                    ? "border-accent-500/50 bg-accent-500/15 text-accent-300"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-200",
                )}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-accent-500/50 bg-accent-500/15 text-sm font-medium text-accent-200 hover:bg-accent-500/25"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={cn("relative w-full max-w-[11.5rem]", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          if (!value?.trim()) commit(partsFromDate(new Date()));
          setOpen((v) => !v);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-left text-sm tabular-nums transition-colors",
          "hover:border-zinc-500 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          display ? "text-zinc-100" : "text-zinc-500",
        )}
      >
        <Clock3 className="h-3.5 w-3.5 shrink-0 text-accent-400" />
        <span className="min-w-0 flex-1 truncate font-medium">{display}</span>
      </button>
      {menu}
    </div>
  );
}

function WheelColumn({
  label,
  values,
  selected,
  onSelect,
  format = String,
}: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (n: number) => void;
  format?: (n: number) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollSelectedIntoView(listRef, selected);
  }, [selected]);

  return (
    <div>
      <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
      <div
        ref={listRef}
        className="h-36 overflow-y-auto rounded-xl border border-zinc-800 bg-black/30 py-1 [scrollbar-width:thin]"
      >
        {values.map((n) => {
          const active = n === selected;
          return (
            <button
              key={n}
              type="button"
              data-val={n}
              onClick={() => onSelect(n)}
              className={cn(
                "flex h-9 w-full items-center justify-center text-sm tabular-nums transition-colors",
                active
                  ? "bg-accent-500/20 font-semibold text-accent-200"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              {format(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scrollSelectedIntoView(
  listRef: RefObject<HTMLDivElement | null>,
  selected: number,
) {
  const root = listRef.current;
  if (!root) return;
  const el = root.querySelector<HTMLElement>(`[data-val="${selected}"]`);
  el?.scrollIntoView({ block: "center" });
}
