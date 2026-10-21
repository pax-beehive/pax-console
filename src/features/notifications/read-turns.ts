import type { SessionEvent } from "@/features/runtime/session-events";

/** Matches pax-manager notifications.stableID: Go JSON string array + SHA256. */
export async function turnNotificationId(
  userId: string,
  agentId: string,
  sessionId: string,
  turnId: string,
) {
  const encoded = JSON.stringify([userId, agentId, sessionId, turnId]).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(encoded),
  );
  return (
    "ntf_" +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
  );
}

/** Only acknowledge a final durable reply which is also present on screen. */
export function completedReplyTargets(
  history: SessionEvent[],
  rendered: SessionEvent[],
  sessionId: string,
) {
  const completed = new Set(
    history
      .filter(
        (event) =>
          event.sessionId === sessionId &&
          event.type === "turn_done" &&
          event.turnId,
      )
      .map((event) => event.turnId),
  );
  const replies = new Map<string, string>();
  for (const event of history) {
    if (
      event.sessionId === sessionId &&
      event.type === "agent_message" &&
      event.turnId &&
      completed.has(event.turnId) &&
      event.content.trim()
    )
      replies.set(event.turnId, event.content);
  }
  const targetsByTurn = new Map<string, string>();
  for (const event of rendered) {
    if (
      event.sessionId === sessionId &&
      event.type === "agent_message" &&
      event.turnId
    ) {
      // A later partial/different reply must not leave an earlier match eligible.
      targetsByTurn.delete(event.turnId);
      if (replies.get(event.turnId) === event.content)
        targetsByTurn.set(event.turnId, event.id);
    }
  }
  return new Map(
    [...targetsByTurn].map(([turnId, eventId]) => [eventId, turnId]),
  );
}
