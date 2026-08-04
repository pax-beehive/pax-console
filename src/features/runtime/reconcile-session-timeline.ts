import { filterMergedLiveEventsAlreadyInHistory } from "./filter-live-history-events";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

export type ReconciledSessionTimeline = {
  historyEvents: SessionEvent[];
  liveEvents: SessionEvent[];
  timeline: SessionEvent[];
};

/**
 * Durable history, the owned conversation stream, and the observer are ordered
 * sources with different completeness guarantees. Conversation owns the agent
 * output for a locally submitted turn. Observer replay is only an incremental
 * continuation, so it extends the existing history/conversation prefix instead
 * of replacing the whole turn.
 *
 * Events from older servers without turn IDs retain the legacy text-based
 * overlap filter as a compatibility fallback.
 */
export function reconcileSessionTimeline(
  historyEvents: SessionEvent[],
  conversationEvents: SessionEvent[],
  observerEvents: SessionEvent[] = [],
): ReconciledSessionTimeline {
  const mergedHistory = mergeEvents(historyEvents);
  const mergedConversation = mergeEvents(conversationEvents);
  const mergedObserver = mergeEvents(observerEvents);
  const committedTurnIds = completedTurnIds(mergedHistory);
  const activeConversation = mergedConversation.filter(
    (event) => !event.turnId || !committedTurnIds.has(event.turnId),
  );
  const activeObserver = mergedObserver.filter(
    (event) => !event.turnId || !committedTurnIds.has(event.turnId),
  );
  const conversationByTurn = eventsByBusinessTurn(activeConversation);
  const observerByTurn = eventsByBusinessTurn(activeObserver);
  const historyByTurn = eventsByBusinessTurn(mergedHistory);
  const runtimeTurnIds = orderedRuntimeTurnIds(
    activeConversation,
    activeObserver,
  );
  const replacementByTurn = new Map<string, SessionEvent[]>();
  const visibleHistoryIds = new Set<string>();

  for (const [turnId, historyTurn] of historyByTurn) {
    const conversationTurn = conversationByTurn.get(turnId);
    const observerTurn = observerByTurn.get(turnId);

    if (conversationTurn) {
      const durableUserEvents = historyTurn.filter(
        (event) => event.type === "user_message",
      );
      for (const event of durableUserEvents) {
        visibleHistoryIds.add(event.id);
      }
      replacementByTurn.set(
        turnId,
        composeTurn(durableUserEvents, conversationTurn, observerTurn ?? []),
      );
      continue;
    }

    for (const event of historyTurn) {
      visibleHistoryIds.add(event.id);
    }
    if (observerTurn) {
      replacementByTurn.set(turnId, composeTurn(historyTurn, [], observerTurn));
    }
  }

  for (const turnId of runtimeTurnIds) {
    if (replacementByTurn.has(turnId)) {
      continue;
    }
    replacementByTurn.set(
      turnId,
      composeTurn(
        [],
        conversationByTurn.get(turnId) ?? [],
        observerByTurn.get(turnId) ?? [],
      ),
    );
  }

  const visibleHistory = mergedHistory.filter(
    (event) =>
      !isBusinessTurnId(event.turnId) || visibleHistoryIds.has(event.id),
  );
  const visibleLegacyConversation = filterMergedLiveEventsAlreadyInHistory(
    activeConversation.filter((event) => !isBusinessTurnId(event.turnId)),
    visibleHistory,
  );
  const visibleLegacyObserver = filterMergedLiveEventsAlreadyInHistory(
    activeObserver.filter((event) => !isBusinessTurnId(event.turnId)),
    mergeEvents([...visibleHistory, ...visibleLegacyConversation]),
  );
  const timeline = placeTurnsAtHistoryAnchors(
    mergedHistory,
    replacementByTurn,
    runtimeTurnIds,
  );
  const visibleRuntime = mergeEvents([
    ...visibleLegacyConversation,
    ...visibleLegacyObserver,
    ...runtimeTurnIds.flatMap((turnId) =>
      composeTurn(
        [],
        conversationByTurn.get(turnId) ?? [],
        observerByTurn.get(turnId) ?? [],
      ),
    ),
  ]);

  return {
    historyEvents: visibleHistory,
    liveEvents: visibleRuntime,
    timeline: mergeEvents([
      ...timeline,
      ...visibleLegacyConversation,
      ...visibleLegacyObserver,
    ]),
  };
}

function composeTurn(
  historyPrefix: SessionEvent[],
  conversationEvents: SessionEvent[],
  observerEvents: SessionEvent[],
) {
  const visibleConversation = filterMergedLiveEventsAlreadyInHistory(
    conversationEvents,
    historyPrefix,
  );
  const prefix = mergeEvents([...historyPrefix, ...visibleConversation]);
  const visibleObserver = filterMergedLiveEventsAlreadyInHistory(
    observerEvents,
    prefix,
  );
  return mergeEvents([...prefix, ...visibleObserver]);
}

function eventsByBusinessTurn(events: SessionEvent[]) {
  const byTurn = new Map<string, SessionEvent[]>();
  for (const event of events) {
    if (!isBusinessTurnId(event.turnId)) {
      continue;
    }
    byTurn.set(event.turnId, [...(byTurn.get(event.turnId) ?? []), event]);
  }
  return byTurn;
}

function orderedRuntimeTurnIds(
  conversationEvents: SessionEvent[],
  observerEvents: SessionEvent[],
) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const event of [...conversationEvents, ...observerEvents]) {
    if (!isBusinessTurnId(event.turnId) || seen.has(event.turnId)) {
      continue;
    }
    seen.add(event.turnId);
    ordered.push(event.turnId);
  }
  return ordered;
}

function placeTurnsAtHistoryAnchors(
  historyEvents: SessionEvent[],
  replacementByTurn: Map<string, SessionEvent[]>,
  runtimeTurnIds: string[],
) {
  const timeline: SessionEvent[] = [];
  const placedTurnIds = new Set<string>();

  for (const event of historyEvents) {
    if (!isBusinessTurnId(event.turnId)) {
      timeline.push(event);
      continue;
    }

    const replacement = replacementByTurn.get(event.turnId);
    if (!replacement) {
      timeline.push(event);
      continue;
    }
    if (!placedTurnIds.has(event.turnId)) {
      timeline.push(...replacement);
      placedTurnIds.add(event.turnId);
    }
  }

  for (const turnId of runtimeTurnIds) {
    if (placedTurnIds.has(turnId)) {
      continue;
    }
    timeline.push(...(replacementByTurn.get(turnId) ?? []));
    placedTurnIds.add(turnId);
  }

  return timeline;
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
