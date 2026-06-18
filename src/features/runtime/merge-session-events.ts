import { SessionEvent } from "./session-events";

export function mergeEvents(events: SessionEvent[]) {
  // REST history and tunnel notifications can overlap. Keep the latest event
  // per id, but append streaming text chunks that share a turn-scoped id.
  const byId = new Map<string, SessionEvent>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (
      existing &&
      isStreamingTextEvent(existing) &&
      isStreamingTextEvent(event) &&
      existing.type === event.type
    ) {
      byId.set(event.id, {
        ...event,
        content: `${existing.content}${event.content}`,
        createdAt: existing.createdAt,
      });
      continue;
    }

    byId.set(event.id, event);
  }

  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

function isStreamingTextEvent(
  event: SessionEvent,
): event is Extract<SessionEvent, { type: "agent_message" | "progress" }> {
  return (
    (event.type === "agent_message" || event.type === "progress") &&
    event.streaming === true
  );
}
