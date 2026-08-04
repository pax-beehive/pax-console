import { filterMergedLiveEventsAlreadyInHistory } from "./filter-live-history-events";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

export type ReconciledSessionTimeline = {
  historyEvents: SessionEvent[];
  liveEvents: SessionEvent[];
  timeline: SessionEvent[];
};

/**
 * Durable history and live SSE are two representations of the same turn.
 * A turn with live events stays wholly owned by SSE until durable history
 * contains its terminal event. The handoff then replaces the whole live turn
 * atomically, so partial history can never render beside its streamed copy.
 *
 * Events from older servers without turn IDs retain the legacy text-based
 * overlap filter as a compatibility fallback.
 */
export function reconcileSessionTimeline(
  historyEvents: SessionEvent[],
  runtimeEvents: SessionEvent[],
): ReconciledSessionTimeline {
  const mergedHistory = mergeEvents(historyEvents);
  const mergedRuntime = mergeEvents(runtimeEvents);
  const committedTurnIds = completedTurnIds(mergedHistory);
  const overlayTurnIds = new Set<string>();

  for (const event of mergedRuntime) {
    if (isBusinessTurnId(event.turnId) && !committedTurnIds.has(event.turnId)) {
      overlayTurnIds.add(event.turnId);
    }
  }

  const visibleHistory = mergedHistory.filter(
    (event) => !event.turnId || !overlayTurnIds.has(event.turnId),
  );
  const legacyRuntime = mergedRuntime.filter(
    (event) => !isBusinessTurnId(event.turnId),
  );
  const visibleLegacyRuntime = new Set(
    filterMergedLiveEventsAlreadyInHistory(legacyRuntime, visibleHistory),
  );
  const visibleRuntime = mergedRuntime.filter((event) =>
    isBusinessTurnId(event.turnId)
      ? overlayTurnIds.has(event.turnId)
      : visibleLegacyRuntime.has(event),
  );

  return {
    historyEvents: visibleHistory,
    liveEvents: visibleRuntime,
    timeline: mergeEvents([...visibleHistory, ...visibleRuntime]),
  };
}

export function latestRuntimeTurnId(events: SessionEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.turnId) {
      return events[index].turnId;
    }
  }
  return undefined;
}

function completedTurnIds(events: SessionEvent[]) {
  return new Set(
    events
      .filter(
        (
          event,
        ): event is Extract<SessionEvent, { type: "turn_done" }> & {
          turnId: string;
        } => event.type === "turn_done" && Boolean(event.turnId),
      )
      .map((event) => event.turnId),
  );
}

function isBusinessTurnId(turnId: string | undefined): turnId is string {
  return Boolean(turnId && !turnId.startsWith("pending-turn:"));
}
