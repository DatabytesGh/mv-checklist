"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/providers/toast-provider";

interface Vendor {
  id: number | string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional — omit for standalone (ad-hoc) faults not linked to a checklist. */
  sessionId?: string | number | null;
  itemResponseId?: string | number | null;
  /**
   * When provided, the fault title is fixed to the checklist item's text.
   * When omitted, the user is asked to type a title (standalone mode).
   */
  itemTitle?: string;
  vendors: Vendor[];
  onSaved: () => void;
}

export function FaultCaptureSheet({
  open,
  onClose,
  sessionId,
  itemResponseId,
  itemTitle,
  vendors,
  onSaved,
}: Props) {
  const standalone = !itemTitle;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [vendorId, setVendorId] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  if (!open) return null;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setPhotos((prev) => [...prev, ...Array.from(files)].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const effectiveTitle = itemTitle ?? title.trim();

  const saveFault = async () => {
    if (!effectiveTitle) {
      setError("Title is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    setSaving(true);
    setError(null);
    const form = new FormData();
    if (sessionId) form.append("sessionId", String(sessionId));
    if (itemResponseId) form.append("itemResponseId", String(itemResponseId));
    form.append("title", effectiveTitle);
    form.append("description", description);
    form.append("location", location);
    form.append("severity", severity);
    if (vendorId) form.append("vendorId", vendorId);
    photos.forEach((f, i) => form.append(`photo${i}`, f));

    const res = await fetch("/api/faults", { method: "POST", body: form });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
      return;
    }
    await res.json();
    toast.success("Fault submitted — send it to the vendor from the Faults page");
    onSaved();
    setTitle("");
    setDescription("");
    setLocation("");
    setSeverity("medium");
    setVendorId("");
    setPhotos([]);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 md:items-center">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <CardHeader>
          <CardTitle>Report fault</CardTitle>
          {itemTitle ? (
            <p className="text-sm text-zinc-400">{itemTitle}</p>
          ) : (
            <p className="text-sm text-zinc-400">
              Log a new issue for the maintenance team.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {standalone && (
            <div>
              <label className="text-sm text-zinc-400">Title</label>
              <input
                className="input-field mt-1"
                placeholder="e.g. Broken tap in Room 12"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-sm text-zinc-400">Description</label>
            <textarea
              className="input-field mt-1 min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400">Location</label>
            <input
              className="input-field mt-1"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400">Severity</label>
            <select
              className="input-field mt-1"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-zinc-400">Vendor</label>
            <select
              className="input-field mt-1"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-zinc-400">Photos (up to 3)</label>
            {previews.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {previews.map((url, i) => (
                  <div
                    key={url}
                    className="group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Fault"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => removePhoto(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            {photos.length < 3 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="tap-target mt-2 inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {photos.length > 0 ? (
                  <ImagePlus className="h-3.5 w-3.5" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {photos.length > 0 ? "Add another photo" : "Take / add photo"}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={saveFault}
              disabled={saving || !description || (standalone && !title.trim())}
            >
              {saving ? "Submitting…" : "Submit fault"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
