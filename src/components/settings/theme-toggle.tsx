"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/providers/theme-provider";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Full segmented control — for settings. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const active = mounted ? theme : "system";

  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={selected}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-colors tap-target",
              selected
                ? "bg-accent-500 text-zinc-950 shadow-lg shadow-accent-500/20"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact cycle button — for the sidebar / headers. */
export function ThemeQuickToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const active: Theme = mounted ? theme : "system";

  const next: Record<Theme, Theme> = {
    light: "dark",
    dark: "system",
    system: "light",
  };
  const Icon = active === "light" ? Sun : active === "dark" ? Moon : Monitor;
  const label =
    active === "light" ? "Light" : active === "dark" ? "Dark" : "System";

  return (
    <button
      type="button"
      onClick={() => setTheme(next[active])}
      title={`Theme: ${label} (tap to change)`}
      aria-label={`Theme: ${label}. Tap to change.`}
      className={cn(
        "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300",
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </button>
  );
}
