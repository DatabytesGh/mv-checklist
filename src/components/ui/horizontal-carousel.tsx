"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 8;

interface Props {
  children: ReactNode;
  /** Item count — used to decide when nav is useful. */
  itemCount: number;
  /** How many cards are typically visible on large screens (default 3). */
  visibleAtLg?: number;
  className?: string;
  scrollerClassName?: string;
  prevLabel?: string;
  nextLabel?: string;
}

export function HorizontalCarousel({
  children,
  itemCount,
  visibleAtLg = 3,
  className,
  scrollerClassName,
  prevLabel = "Previous",
  nextLabel = "Next",
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [itemCount, updateArrows]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = scrollerRef.current;
      const state = dragRef.current;
      if (!el || !state || state.pointerId !== e.pointerId) return;

      const dx = e.clientX - state.startX;
      if (!state.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        state.moved = true;
        setDragging(true);
        el.style.scrollSnapType = "none";
        // Capture only after we know it's a drag — keeps card clicks working.
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      el.scrollLeft = state.startScroll - dx;
      e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      const el = scrollerRef.current;
      const state = dragRef.current;
      if (!el || !state || state.pointerId !== e.pointerId) return;

      const didDrag = state.moved;
      dragRef.current = null;
      setDragging(false);
      el.style.scrollSnapType = "";
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }

      if (didDrag) {
        const suppress = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          el.removeEventListener("click", suppress, true);
        };
        el.addEventListener("click", suppress, true);
        window.setTimeout(
          () => el.removeEventListener("click", suppress, true),
          0,
        );
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Leave touch to native momentum scrolling; drag is for mouse/pen.
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };

  const showArrows = itemCount > visibleAtLg || canPrev || canNext;

  return (
    <div
      className={cn(
        // Inset the track so side buttons can sit outside the section content.
        "relative mx-3 overflow-visible md:mx-5",
        className,
      )}
    >
      {showArrows && (
        <>
          <CarouselNavButton
            side="left"
            label={prevLabel}
            disabled={!canPrev}
            onClick={() => scrollByPage(-1)}
          />
          <CarouselNavButton
            side="right"
            label={nextLabel}
            disabled={!canNext}
            onClick={() => scrollByPage(1)}
          />
        </>
      )}

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "touch-pan-x",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
          dragging && "[&_a]:pointer-events-none [&_button]:pointer-events-none",
          scrollerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export const CAROUSEL_SLIDE_CLASS =
  "w-[min(280px,85%)] shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]";

function CarouselNavButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center overflow-hidden md:flex",
        "h-[min(100%,11rem)] min-h-[7.5rem] w-11 rounded-2xl",
        // Liquid glass: frosted translucent fill so card content stays readable underneath
        "border border-zinc-100/25 bg-zinc-950/25 text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.22)]",
        "backdrop-blur-xl backdrop-saturate-150",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl",
        "before:bg-gradient-to-b before:from-zinc-50/30 before:via-zinc-50/5 before:to-transparent",
        "ring-1 ring-inset ring-zinc-50/15",
        "transition-[background-color,border-color,color,box-shadow] duration-200",
        // Hang outside the track — “falling away” from the section edges.
        side === "left" ? "-left-4 md:-left-6" : "-right-4 md:-right-6",
        disabled
          ? "cursor-default opacity-30"
          : "hover:border-zinc-50/40 hover:bg-zinc-950/35 hover:text-white hover:shadow-[0_8px_36px_rgba(0,0,0,0.3)]",
      )}
    >
      <span className="relative z-10 drop-shadow-sm">
        {side === "left" ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </span>
    </button>
  );
}
