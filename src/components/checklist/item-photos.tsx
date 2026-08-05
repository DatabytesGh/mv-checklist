"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Camera, X, Loader2, ImagePlus } from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";

/** Full-screen image viewer, portaled to <body> so it escapes page layout. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" strokeWidth={2.5} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Checklist item"
        className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

export interface ItemPhoto {
  id: string;
  url: string;
}

interface Props {
  sessionId: string | number;
  templateItemId: string | number;
  photos: ItemPhoto[];
  /** Read-only photos attached to the fault reported for this item. */
  faultPhotos?: string[];
  /** Whether the current user may add/remove photos for this item. */
  canEdit: boolean;
  /** Show the built-in "Add photo" trigger button. Defaults to true when canEdit. */
  showAddButton?: boolean;
  onChanged: () => void;
}

export function ItemPhotos({
  sessionId,
  templateItemId,
  photos,
  faultPhotos = [],
  canEdit,
  showAddButton = true,
  onChanged,
}: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const upload = async (files: FileList) => {
    if (files.length === 0) return;
    setUploading(true);
    const form = new FormData();
    form.append("sessionId", String(sessionId));
    form.append("templateItemId", String(templateItemId));
    Array.from(files)
      .slice(0, 5)
      .forEach((f, i) => form.append(`photo${i}`, f));
    try {
      const res = await fetch("/api/checklists/items/photos", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not upload photo");
      } else {
        const d = await res.json().catch(() => ({ photos: [] }));
        toast.success(
          `${(d.photos ?? []).length} photo${
            (d.photos ?? []).length === 1 ? "" : "s"
          } added`,
        );
        onChanged();
      }
    } catch {
      toast.error("Could not upload photo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (photoId: string) => {
    try {
      const res = await fetch("/api/checklists/items/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Could not remove photo");
      } else {
        onChanged();
      }
    } catch {
      toast.error("Could not remove photo");
    }
  };

  if (!canEdit && photos.length === 0 && faultPhotos.length === 0) return null;

  const hasThumbnails = photos.length > 0 || faultPhotos.length > 0;

  return (
    <div className="space-y-2">
      {hasThumbnails && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="Checklist item"
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => setViewer(p.url)}
              />
              {canEdit && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => remove(p.id)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
          ))}

          {faultPhotos.map((url) => (
            <div
              key={url}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-amber-500/50"
              title="Fault photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Fault"
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => setViewer(url)}
              />
              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
              </span>
            </div>
          ))}
        </div>
      )}

      {canEdit && showAddButton && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "tap-target inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : photos.length > 0 ? (
              <ImagePlus className="h-3.5 w-3.5" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {uploading
              ? "Uploading…"
              : photos.length > 0
                ? "Add photo"
                : "Add photo"}
          </button>
        </>
      )}

      {viewer && <Lightbox url={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
