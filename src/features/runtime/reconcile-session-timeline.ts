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
  conversationEvents: SessionEvent[],
  observerEvents: SessionEvent[] = [],
): ReconciledSessionTimeline {
  const mergedHistory = mergeEvents(historyEvents);
  const mergedConversation = mergeEvents(conversationEvents);
  const mergedObserver = mergeEvents(observerEvents);
  const committedTurnIds = completedTurnIds(mergedHistory);
  const conversationTurnIds = activeBusinessTurnIds(
    mergedConversation,
    committedTurnIds,
  );
  const observerTurnIds = activeBusinessTurnIds(
    mergedObserver,
    committedTurnIds,
  );
  const observerTakeoverTurnIds = new Set(
    [...conversationTurnIds].filter((turnId) => observerTurnIds.has(turnId)),
  );

  const visibleHistory = mergedHistory.filter(
    (event) => !event.turnId || !conversationTurnIds.has(event.turnId),
  );
  const visibleConversation = mergedConversation.filter(
    (event) =>
      isBusinessTurnId(event.turnId) &&
      !committedTurnIds.has(event.turnId) &&
      (!observerTakeoverTurnIds.has(event.turnId) ||
        isConversationOnlyEvent(event)),
  );
  const observerBusinessEvents = mergedObserver.filter(
    (event) =>
      isBusinessTurnId(event.turnId) &&
      !committedTurnIds.has(event.turnId),
  );
  const visibleObserver = filterMergedLiveEventsAlreadyInHistory(
    observerBusinessEvents,
    visibleHistory,
  );
  const legacyRuntime = mergeEvents([
    ...mergedConversation.filter((event) => !isBusinessTurnId(event.turnId)),
    ...mergedObserver.filter((event) => !isBusinessTurnId(event.turnId)),
  ]);
  const visibleLegacyRuntime = filterMergedLiveEventsAlreadyInHistory(
    legacyRuntime,
    visibleHistory,
  );
  const visibleRuntime = mergeEvents([
    ...visibleConversation,
    ...visibleObserver,
    ...visibleLegacyRuntime,
  ]);
  const baseTimeline = mergeEvents([
    ...visibleHistory,
    ...visibleConversation,
    ...visibleLegacyRuntime,
  ]);

  return {
    historyEvents: visibleHistory,
    liveEvents: visibleRuntime,
    timeline: appendObservedEvents(baseTimeline, visibleObserver),
  };
}

function activeBusinessTurnIds(
  events: SessionEvent[],
  committedTurnIds: Set<string>,
) {
  return new Set(
    events
      .filter(
        (event): event is SessionEvent & { turnId: string } =>
          isBusinessTurnId(event.turnId) &&
          !committedTurnIds.has(event.turnId),
      )
      .map((event) => event.turnId),
  );
}

function isConversationOnlyEvent(event: SessionEvent) {
  return (
    event.type === "user_message" ||
    event.type === "permission_decision" ||
    event.type === "run_status"
  );
}

/**
 * An observer can start after durable history has already stored the beginning
 * of a turn. Keep that prefix and append the observer suffix. If the observer
 * replays the current text block from its beginning, replace the stored prefix
 * instead of rendering both copies.
 */
function appendObservedEvents(
  baseEvents: SessionEvent[],
  observerEvents: SessionEvent[],
) {
  let timeline = mergeEvents(baseEvents);

  for (const event of observerEvents) {
    const previousIndex = lastVisibleEventIndex(timeline);
    if (previousIndex === undefined) {
      timeline = mergeEvents([...timeline, event]);
      continue;
    }
    const previous = timeline[previousIndex];
    if (
      isObservedTextEvent(previous) &&
      isObservedTextEvent(event) &&
      canJoinObservedText(previous, event)
    ) {
      if (previous.content.startsWith(event.content)) {
        continue;
      }
      timeline[previousIndex] = {
        ...event,
        content: event.content.startsWith(previous.content)
          ? event.content
          : `${previous.content}${event.content}`,
        createdAt: previous.createdAt,
        id: previous.id,
      };
      continue;
    }
    timeline = mergeEvents([...timeline, event]);
  }

  return timeline;
}

function lastVisibleEventIndex(events: SessionEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (
      events[index]?.type !== "run_status" &&
      events[index]?.type !== "turn_done" &&
      events[index]?.type !== "token_usage" &&
      events[index]?.type !== "permission_decision"
    ) {
      return index;
    }
  }
  return undefined;
}

function canJoinObservedText(
  previous: ObservedTextEvent,
  event: ObservedTextEvent,
) {
  return (
    previous.type === event.type &&
    previous.sessionId === event.sessionId &&
    previous.turnId === event.turnId &&
    previous.sessionUpdate === event.sessionUpdate
  );
}

type ObservedTextEvent = Extract<
  SessionEvent,
  { type: "agent_message" | "progress" }
>;

function isObservedTextEvent(event: SessionEvent): event is ObservedTextEvent {
  return event.type === "agent_message" || event.type === "progress";
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
