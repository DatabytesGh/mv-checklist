"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShiftLeaderOption = {
  id: string;
  name: string;
};

type Props = {
  value: string;
  options: ShiftLeaderOption[];
  disabled?: boolean;
  onChange: (name: string) => void;
  className?: string;
};

type MenuPos = { top: number; left: number; width: number };

export function ShiftLeaderPicker({
  value,
  options,
  disabled,
  onChange,
  className,
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => setMounted(true), []);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 220);
    const gap = 6;
    const menuMaxH = 220;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const openUp = spaceBelow < Math.min(menuMaxH, 160) && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - gap : r.bottom + gap,
      left: Math.min(r.left, window.innerWidth - width - 8),
      width,
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
    // Capture scroll from nested containers too.
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

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const label = value?.trim() || "Select shift leader";

  const menu =
    mounted &&
    open &&
    pos &&
    createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: 100,
          // If opened upward, anchor from bottom of the point.
          transform:
            pos.top < (triggerRef.current?.getBoundingClientRect().top ?? 0)
              ? "translateY(-100%)"
              : undefined,
        }}
        className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name…"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <ul className="max-h-44 overflow-y-auto py-1">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                !value
                  ? "bg-accent-500/15 text-accent-200"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
              )}
            >
              <span className="min-w-0 flex-1 truncate">Clear selection</span>
            </button>
          </li>
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-zinc-500">
              No matches
            </li>
          )}
          {filtered.map((opt) => {
            const selected = opt.name === value;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.name);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                    selected
                      ? "bg-accent-500/15 text-accent-200"
                      : "text-zinc-200 hover:bg-zinc-900",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body,
    );

  return (
    <div className={cn("relative w-full max-w-[16.5rem]", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-left text-sm transition-colors",
          "hover:border-zinc-500 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          value ? "text-zinc-100" : "text-zinc-500",
        )}
      >
        <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>
      {menu}
    </div>
  );
}
