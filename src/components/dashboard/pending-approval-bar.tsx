"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PendingApprovalItem {
  slug: string;
  label: string;
  sessionId: string;
}

interface Props {
  items: PendingApprovalItem[];
  className?: string;
  onReview?: (item: PendingApprovalItem) => void;
}

function bannerLabel(items: PendingApprovalItem[]): string {
  if (items.length === 1) {
    return `${items[0].label} awaiting approval`;
  }
  return `${items[0].label} +${items.length - 1} more awaiting approval`;
}

export function PendingApprovalBar({
  items = [],
  className,
  onReview,
}: Props) {
  if (!items?.length) return null;

  const primary = items[0];

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-0 right-0 z-40 px-3 sm:px-4",
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:pl-56",
        className,
      )}
      role="region"
      aria-label="Checklist awaiting approval"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl lg:max-w-4xl">
        <button
          type="button"
          onClick={() => onReview?.(primary)}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-full border border-amber-600/50 bg-amber-50 px-4 py-3 text-left shadow-2xl shadow-black/10 backdrop-blur-md transition-colors hover:border-amber-600 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-zinc-950/95 dark:shadow-black/40 dark:hover:border-amber-400/70 dark:hover:bg-zinc-900/95 sm:px-5 sm:py-3.5"
        >
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-amber-900 dark:text-amber-200">
            <span className="line-clamp-2">{bannerLabel(items)}</span>
          </span>
          <span className="shrink-0 rounded-full border border-amber-700/40 bg-amber-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
            Review
          </span>
        </button>
        {items.length > 1 && (
          <p className="mt-2 text-center text-[10px] text-zinc-500">
            Reviews {primary.label}.{" "}
            <Link
              href="/checklists"
              className="font-medium text-amber-800 underline dark:text-amber-400/90"
            >
              See all {items.length}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** Reserve space so page content is not hidden behind the floating bar. */
export function PendingApprovalSpacer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div className="h-24 md:h-20" aria-hidden />;
}
