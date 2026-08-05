"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

/** A bordered panel with an optional header (title + description + action). */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/60 shadow-xl backdrop-blur",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/60 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A labeled form field. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-zinc-300"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-accent-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** A row with a label/description on the left and a control on the right. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-zinc-200">{label}</p>
        {description && (
          <p className="text-[11px] text-zinc-500">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}

/** A divided list container — replaces stacks of individual cards. */
export function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-zinc-800/60">{children}</div>;
}

export function ListRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-zinc-900/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Circular initials avatar. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">
      {initials || "?"}
    </div>
  );
}

export function Pill({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "green" | "red" | "amber" | "sky";
}) {
  const tones: Record<string, string> = {
    zinc: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
    green: "border-accent-500/40 bg-accent-500/10 text-accent-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Centered modal dialog. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md ≈ settings forms; lg for denser lists like conference checklists. */
  size?: "md" | "lg";
}) {
  const mounted = useMounted();

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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:rounded-3xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/70 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-zinc-800/70 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Themed confirmation dialog (replaces window.confirm). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="px-5 pt-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                destructive
                  ? "bg-red-500/15 text-red-400"
                  : "bg-accent-500/15 text-accent-300",
              )}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
