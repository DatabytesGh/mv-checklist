import type { ActivityEvent } from "./activity-types";

type Listener = (event: ActivityEvent) => void;

class ActivityBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ActivityEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[activity-bus]", e);
      }
    }
  }
}

const globalForBus = globalThis as typeof globalThis & {
  __mvActivityBus?: ActivityBus;
};

export const activityBus =
  globalForBus.__mvActivityBus ?? (globalForBus.__mvActivityBus = new ActivityBus());
