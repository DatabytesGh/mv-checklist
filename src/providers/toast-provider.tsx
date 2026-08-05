"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastApi = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATION = 4500;

const VARIANTS: Record<
  ToastType,
  { icon: typeof Info; iconClass: string; ring: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "bg-accent-500/15 text-accent-300",
    ring: "before:bg-accent-500",
  },
  error: {
    icon: AlertCircle,
    iconClass: "bg-red-500/15 text-red-400",
    ring: "before:bg-red-500",
  },
  info: {
    icon: Info,
    iconClass: "bg-sky-500/15 text-sky-300",
    ring: "before:bg-sky-500",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mounted = useMounted();
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-end sm:px-4"
            role="region"
            aria-live="polite"
          >
            {toasts.map((t) => (
              <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const variant = VARIANTS[toast.type];
  const Icon = variant.icon;
  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 py-3 pl-4 pr-3 shadow-2xl backdrop-blur",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        "animate-[toast-in_180ms_ease-out]",
        variant.ring,
      )}
      role="alert"
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl",
          variant.iconClass,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <p className="min-w-0 flex-1 break-words pt-1 text-sm leading-snug text-zinc-200">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="tap-target -mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
