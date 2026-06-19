import { HistoryMessage } from "@/features/api/types";
import { SessionEvent } from "./session-events";

export function normalizeHistoryMessage(message: HistoryMessage): SessionEvent[] {
  const sessionId = message.session_id ?? "unknown-session";
  const createdAt = message.created_at ?? new Date().toISOString();
  const id = message.message_id ?? String(message.id ?? crypto.randomUUID());
  const content = textFromParts(message);

  if (!content) {
    return [];
  }

  return [
    {
      type: message.role === "user" ? "user_message" : "agent_message",
      id,
      sessionId,
      content,
      createdAt,
    },
  ];
}

function textFromParts(message: HistoryMessage) {
  return [...(message.parts ?? [])]
    .sort((a, b) => a.part_index - b.part_index)
    .filter((part) => part.part_type === "text")
    .map((part) => part.text ?? "")
    .join("");
}
