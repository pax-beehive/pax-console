import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

export function filterLiveEventsAlreadyInHistory(
  liveEvents: SessionEvent[],
  historyEvents: SessionEvent[],
) {
  const mergedHistoryEvents = mergeEvents(historyEvents);
  const mergedLiveEvents = mergeEvents(liveEvents);
  return filterMergedLiveEventsAlreadyInHistory(
    mergedLiveEvents,
    mergedHistoryEvents,
  );
}

export function filterMergedLiveEventsAlreadyInHistory(
  mergedLiveEvents: SessionEvent[],
  mergedHistoryEvents: SessionEvent[],
) {
  const historyTextKeys = new Set(
    mergedHistoryEvents
      .map(textEventKey)
      .filter((key): key is string => Boolean(key)),
  );
  if (historyTextKeys.size === 0) {
    return mergedLiveEvents;
  }

  return mergedLiveEvents.filter((event) => {
    const key = textEventKey(event);
    return !key || !historyTextKeys.has(key);
  });
}

function textEventKey(event: SessionEvent) {
  if (
    event.type !== "user_message" &&
    event.type !== "agent_message" &&
    event.type !== "progress" &&
    event.type !== "invocation"
  ) {
    return undefined;
  }

  const turnScope =
    event.turnId && !event.turnId.startsWith("pending-turn:")
      ? `turn:${event.turnId}`
      : "turn:legacy";
  return `${turnScope}:${event.type}:${event.sessionId}:${normalizeTimelineText(event.content)}`;
}

function normalizeTimelineText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}
