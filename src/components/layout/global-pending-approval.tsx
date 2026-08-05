"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/fetch";
import { useRealtimeRefresh } from "@/providers/realtime-provider";
import {
  PendingApprovalBar,
  type PendingApprovalItem,
} from "@/components/dashboard/pending-approval-bar";
import { ReviewChecklistModal } from "@/components/checklist/review-checklist-modal";

export function GlobalPendingApproval() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.permissions.approveChecklist) {
      setItems([]);
      return;
    }
    const res = await apiFetch("/api/checklists");
    if (!res.ok) return;
    const data = await res.json();
    const pending = (data.checklists ?? [])
      .filter(
        (c: {
          status: string;
          sessionId: string | number | null;
          slug: string;
          label: string;
        }) =>
          c.status === "submitted" &&
          c.sessionId != null &&
          String(c.sessionId) !== "null",
      )
      .map(
        (c: {
          slug: string;
          label: string;
          sessionId: string | number;
        }) => ({
          slug: c.slug,
          label: c.label,
          sessionId: String(c.sessionId),
        }),
      );
    setItems(pending);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(load);

  if (pathname === "/login") return null;
  if (!user?.permissions.approveChecklist) return null;

  return (
    <>
      {items.length > 0 && (
        <PendingApprovalBar
          items={items}
          onReview={(item) => setReviewSessionId(item.sessionId)}
        />
      )}
      <ReviewChecklistModal
        open={reviewSessionId != null}
        sessionId={reviewSessionId}
        onClose={() => setReviewSessionId(null)}
        onResolved={load}
      />
    </>
  );
}
