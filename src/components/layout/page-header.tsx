"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  children,
  belowTitle,
  stickyBelow,
  className,
  backHref,
  onBack,
  backLabel = "Back",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Renders directly under the mobile title bar (e.g. live activity strip). */
  belowTitle?: ReactNode;
  /**
   * Pinned strip that stays visible while scrolling — rendered inside the fixed
   * mobile title bar and as a sticky band on desktop (e.g. a progress bar).
   */
  stickyBelow?: ReactNode;
  className?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const hasBack = Boolean(backHref || onBack);

  const backControl = hasBack ? (
    backHref ? (
      <Link
        href={backHref}
        aria-label={backLabel}
        className="tap-target absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-zinc-400 hover:text-zinc-200 md:hidden"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} />
      </Link>
    ) : (
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="tap-target absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-zinc-400 hover:text-zinc-200 md:hidden"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} />
      </button>
    )
  ) : null;

  const desktopBack =
    backHref ? (
      <Link
        href={backHref}
        className="mb-2 hidden text-sm text-zinc-500 hover:text-zinc-300 md:inline-block"
      >
        ← {backLabel}
      </Link>
    ) : onBack ? (
      <button
        type="button"
        onClick={onBack}
        className="mb-2 hidden text-sm text-zinc-500 hover:text-zinc-300 md:inline-block"
      >
        ← {backLabel}
      </button>
    ) : null;

  return (
    <>
      <header
        className={cn(
          "mobile-title-bar border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md",
          className,
        )}
      >
        <div className="relative mx-auto flex min-h-[3.25rem] max-w-3xl flex-col items-center justify-center px-12 py-2 lg:max-w-4xl">
          {backControl}
          <h1 className="line-clamp-2 text-center text-lg font-semibold leading-snug tracking-tight text-zinc-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 line-clamp-1 text-center text-[11px] text-zinc-400">
              {description}
            </p>
          ) : null}
          {children ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
              {children}
            </div>
          ) : null}
        </div>
        {stickyBelow ? (
          <div className="mx-auto max-w-3xl px-4 pb-2.5 pt-0.5 lg:max-w-4xl">
            {stickyBelow}
          </div>
        ) : null}
      </header>
      <div
        className={cn(
          "mobile-title-spacer",
          stickyBelow
            ? "mobile-title-spacer--with-sticky"
            : children
              ? "mobile-title-spacer--with-children"
              : description
                ? "mobile-title-spacer--with-desc"
                : undefined,
        )}
        aria-hidden
      />

      {belowTitle ? (
        <div className="mb-3 md:hidden">{belowTitle}</div>
      ) : null}

      {stickyBelow ? (
        <div className="sticky top-0 z-20 -mx-4 hidden border-b border-zinc-800/80 bg-zinc-950/90 px-4 pb-3 pt-4 backdrop-blur-md md:mb-6 md:block">
          {desktopBack}
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          ) : null}
          {children ? (
            <div className="mt-2 flex flex-wrap gap-2">{children}</div>
          ) : null}
          <div className="mt-3">{stickyBelow}</div>
        </div>
      ) : (
        <div className="hidden md:mb-6 md:block">
          {desktopBack}
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          ) : null}
          {children ? (
            <div className="mt-2 flex flex-wrap gap-2">{children}</div>
          ) : null}
          {belowTitle ? <div className="mt-4">{belowTitle}</div> : null}
        </div>
      )}
    </>
  );
}
