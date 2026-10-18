import "server-only";

import type { ProgressEvent } from "@/lib/graph/analysis-types";

// The FalkorDB user on this instance is not allowed to SUBSCRIBE, so the
// stage event stays in the server process that wrote it. globalThis keeps
// one bus when the route and the pipeline load this module separately.
// The browser only receives the server-sent event.

type Listener = (event: ProgressEvent) => void;

type ProgressBus = {
  latest: Map<string, ProgressEvent>;
  listeners: Map<string, Set<Listener>>;
};

const bus: ProgressBus = ((globalThis as { __gvProgress?: ProgressBus }).__gvProgress ??= {
  latest: new Map(),
  listeners: new Map(),
});

export async function publishProgress(analysisId: string, event: ProgressEvent): Promise<void> {
  bus.latest.set(analysisId, event);
  for (const listener of bus.listeners.get(analysisId) ?? []) {
    listener(event);
  }
}

export async function subscribeProgress(
  analysisId: string,
  onEvent: Listener,
): Promise<() => Promise<void>> {
  let listeners = bus.listeners.get(analysisId);
  if (!listeners) {
    listeners = new Set();
    bus.listeners.set(analysisId, listeners);
  }
  listeners.add(onEvent);
  return async () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) bus.listeners.delete(analysisId);
  };
}
