import type { RealtimeEvent } from '@harmony/shared';

type Listener = (event: RealtimeEvent) => void;

/**
 * Tells every open screen in a workspace that something changed.
 * This runs inside one server process. To run several, publish through Postgres NOTIFY or Redis here.
 */
export class Bus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(workspaceId: string, listener: Listener): () => void {
    const set = this.listeners.get(workspaceId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(workspaceId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(workspaceId);
    };
  }

  publish(workspaceId: string, event: RealtimeEvent) {
    this.listeners.get(workspaceId)?.forEach((listener) => listener(event));
  }
}
