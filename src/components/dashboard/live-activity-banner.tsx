"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { useRealtime } from "@/providers/realtime-provider";
import { activityNotificationCopy } from "@/lib/activity-notify";
import type { ActivityEvent } from "@/lib/activity-types";
import { Bell, BellOff, Radio } from "lucide-react";

export function LiveActivityBanner({
  pendingApproval,
  openFaults,
}: {
  pendingApproval?: number;
  openFaults?: number;
}) {
  const { user } = useAuth();
  const { connected, lastEvent, requestNotifications, notificationsEnabled } =
    useRealtime();
  const [toast, setToast] = useState<ActivityEvent | null>(null);

  const canNotify =
    user &&
    (user.permissions.approveChecklist || user.permissions.viewReports);

  useEffect(() => {
    if (!lastEvent || lastEvent.type === "system.connected") return;
    if (lastEvent.actorUserId === user?.id) return;
    setToast(lastEvent);
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [lastEvent, user]);

  if (!user) return null;

  const toastCopy = toast ? activityNotificationCopy(toast) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 text-zinc-400">
          <Radio
            className={`h-3.5 w-3.5 ${connected ? "text-accent-400" : "text-zinc-600"}`}
          />
          {connected ? "Live updates on" : "Connecting…"}
        </span>

        {(pendingApproval != null || openFaults != null) && (
          <div className="flex items-center gap-5">
            {pendingApproval != null && (
              <span className="flex items-center gap-1.5">
                <span className="uppercase tracking-wide text-zinc-500">
                  Pending approval
                </span>
                <span className="text-sm font-semibold text-amber-400">
                  {pendingApproval}
                </span>
              </span>
            )}
            {openFaults != null && (
              <Link
                href="/faults"
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-700 px-2.5 py-1 transition-colors hover:bg-zinc-900"
              >
                <span className="uppercase tracking-wide text-zinc-500">
                  Open faults
                </span>
                <span className="text-sm font-semibold text-red-400">
                  {openFaults}
                </span>
              </Link>
            )}
          </div>
        )}

        {canNotify && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:bg-zinc-900"
            onClick={() => requestNotifications()}
          >
            {notificationsEnabled ? (
              <Bell className="h-3.5 w-3.5 text-accent-400" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            {notificationsEnabled
              ? "Desktop alerts on"
              : "Enable desktop alerts"}
          </button>
        )}
      </div>

      {toastCopy && (
        <div
          role="status"
          className="rounded-2xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100"
        >
          <p className="font-medium">{toastCopy.title}</p>
          <p className="text-xs text-accent-200/80">{toastCopy.body}</p>
        </div>
      )}
    </>
  );
}
