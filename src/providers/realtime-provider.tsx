"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/auth-provider";
import { useMounted } from "@/hooks/use-mounted";
import type { ActivityEvent } from "@/lib/activity-types";
import { checklistHref } from "@/lib/checklist-slugs";
import {
  activityNotificationCopy,
  shouldNotifyUser,
} from "@/lib/activity-notify";

type ActivityHandler = (event: ActivityEvent) => void;

interface RealtimeContextValue {
  connected: boolean;
  lastEvent: ActivityEvent | null;
  subscribe: (handler: ActivityHandler) => () => void;
  requestNotifications: () => Promise<NotificationPermission | "unsupported">;
  notificationsEnabled: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mounted = useMounted();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ActivityEvent | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const handlersRef = useRef(new Set<ActivityHandler>());
  const sourceRef = useRef<EventSource | null>(null);

  const subscribe = useCallback((handler: ActivityHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  const dispatch = useCallback(
    (event: ActivityEvent) => {
      if (event.type === "system.connected") {
        setConnected(true);
        return;
      }
      setLastEvent(event);
      for (const handler of handlersRef.current) {
        handler(event);
      }

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        user &&
        shouldNotifyUser(event, user)
      ) {
        const { title, body } = activityNotificationCopy(event);
        try {
          const n = new Notification(title, {
            body,
            tag: `mv-${event.type}-${event.entityId}`,
            icon: "/favicon.ico",
          });
          n.onclick = () => {
            window.focus();
            if (event.sessionId && event.checklistSlug) {
              window.location.href = checklistHref(
                event.checklistSlug,
                event.sessionId,
              );
            } else {
              window.location.href = "/";
            }
            n.close();
          };
        } catch {
          /* ignore notification errors */
        }
      }
    },
    [user],
  );

  const requestNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported" as const;
    }
    const result = await Notification.requestPermission();
    setNotificationsEnabled(result === "granted");
    return result;
  }, []);

  useEffect(() => {
    if (!mounted || !user) {
      setConnected(false);
      sourceRef.current?.close();
      sourceRef.current = null;
      return;
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
      if (
        (user.permissions.approveChecklist || user.permissions.viewReports) &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission().then((p) =>
          setNotificationsEnabled(p === "granted"),
        );
      }
    }

    const es = new EventSource("/api/events");
    sourceRef.current = es;

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ActivityEvent;
        dispatch(event);
      } catch {
        /* ignore malformed payloads */
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [mounted, user, dispatch]);

  return (
    <RealtimeContext.Provider
      value={{
        connected,
        lastEvent,
        subscribe,
        requestNotifications,
        notificationsEnabled,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

/** Re-run `refetch` when relevant checklist/fault activity occurs (debounced). */
export function useRealtimeRefresh(
  refetch: () => void,
  options?: { sessionId?: string },
) {
  const { subscribe } = useRealtime();
  const sessionId = options?.sessionId;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "system.connected") return;

      const sameSession =
        !sessionId ||
        event.sessionId === sessionId ||
        event.entityId === sessionId;

      const relevant =
        event.type.startsWith("checklist.") || event.type.startsWith("fault.");

      if (relevant && sameSession) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => refetch(), 350);
      }
    });
  }, [subscribe, refetch, sessionId]);
}
