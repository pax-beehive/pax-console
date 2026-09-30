import type { HistoryMessage } from "@/features/api/types";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import { normalizeHistoryMessage } from "@/features/runtime/normalize-history-message";
import type { SessionEvent } from "@/features/runtime/session-events";

// E2EE rows already carry durable order. Do not apply the ordinary history
// adapter's legacy turn-wide text reordering or adjacent text coalescing.
export function normalizeEncryptedHistory(messages: HistoryMessage[]) {
  return mergeEvents(
    messages
      .flatMap((message) =>
        normalizeHistoryMessage(message).map((event) => ({
          ...event,
          sessionId: message.session_id ?? event.sessionId,
        })),
      )
      .map(freezeText),
  );
}

// Reconcile individual records, never replace or hide an entire turn. A done
// record is not evidence that every earlier header/part has reached the client.
export function reconcileEncryptedTimeline(
  historyEvents: SessionEvent[],
  liveEvents: SessionEvent[],
) {
  const history = mergeEvents(historyEvents.map(freezeText));
  const live = mergeEvents(liveEvents).map(freezeText);
  const replacements = new Map<number, SessionEvent>();
  const insertions = new Map<number, SessionEvent[]>();
  let searchFrom = 0;
  let pending: SessionEvent[] = [];
  const insert = (index: number, events: SessionEvent[]) => {
    insertions.set(index, [...(insertions.get(index) ?? []), ...events]);
  };
  const insertPending = (events: SessionEvent[], fallback: number) => {
    for (const event of events) {
      const completion = event.turnId
        ? history.findIndex(
            (candidate, i) =>
              i >= searchFrom &&
              i < fallback &&
              candidate.turnId === event.turnId &&
              candidate.type === "turn_done",
          )
        : -1;
      insert(completion >= 0 ? completion : fallback, [event]);
    }
  };
  for (const event of live) {
    let index = history.findIndex(
      (candidate, i) => i >= searchFrom && sameRecord(candidate, event, false),
    );
    if (index < 0)
      index = history.findIndex(
        (candidate, i) => i >= searchFrom && sameRecord(candidate, event, true),
      );
    if (index < 0) {
      pending.push(event);
      continue;
    }
    insertPending(pending, index);
    pending = [];
    const durable = history[index];
    replacements.set(index, longerText(durable, event));
    searchFrom = index + 1;
  }
  // A missing live suffix belongs before its durable completion or the next
  // turn, not after newer history. This does not change any durable row's order.
  for (const event of pending) {
    let index = history.length;
    if (event.turnId) {
      const done = history.findIndex(
        (candidate, i) =>
          i >= searchFrom &&
          candidate.turnId === event.turnId &&
          candidate.type === "turn_done",
      );
      if (done >= 0) index = done;
      else {
        const last = history.findLastIndex(
          (candidate) => candidate.turnId === event.turnId,
        );
        if (last >= searchFrom - 1 && last >= 0) index = last + 1;
      }
    }
    insert(index, [event]);
  }
  const timeline = history.flatMap((event, index) => [
    ...(insertions.get(index) ?? []),
    replacements.get(index) ?? event,
  ]);
  timeline.push(...(insertions.get(history.length) ?? []));
  return {
    historyEvents: history,
    liveEvents: live,
    timeline: mergeEvents(timeline),
  };
}

function freezeText(event: SessionEvent): SessionEvent {
  return event.type === "agent_message" || event.type === "progress"
    ? { ...event, streaming: false }
    : event;
}

function sameRecord(a: SessionEvent, b: SessionEvent, allowPrefix: boolean) {
  if (a.sessionId !== b.sessionId || a.type !== b.type) return false;
  if (a.id === b.id) return true;
  // Content matching is only safe inside an identified turn. Never deduplicate
  // identical prompts or responses belonging to different turns.
  if (!a.turnId || a.turnId !== b.turnId) return false;
  if ("content" in a && "content" in b) {
    if (a.type === "user_message") return a.content === b.content;
    return (
      a.content === b.content ||
      Boolean(
        allowPrefix &&
        a.content &&
        b.content &&
        (a.content.startsWith(b.content) || b.content.startsWith(a.content)),
      )
    );
  }
  if (a.type === "tool_call" && b.type === "tool_call") {
    return Boolean(a.toolCallId && a.toolCallId === b.toolCallId);
  }
  if (
    (a.type === "permission_request" && b.type === "permission_request") ||
    (a.type === "permission_decision" && b.type === "permission_decision")
  ) {
    return a.requestId === b.requestId;
  }
  return a.type === "turn_done";
}

function longerText(history: SessionEvent, live: SessionEvent): SessionEvent {
  if (
    (history.type === "agent_message" || history.type === "progress") &&
    live.type === history.type &&
    live.content.startsWith(history.content)
  ) {
    return { ...history, content: live.content };
  }
  if (
    history.type === "tool_call" &&
    live.type === "tool_call" &&
    history.status !== "done" &&
    history.status !== "error"
  ) {
    return { ...mergeEvents([history, live])[0], id: history.id };
  }
  return history;
}
