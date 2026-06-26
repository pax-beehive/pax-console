import { HistoryMessage } from "@/features/api/types";
import { SessionEvent } from "./session-events";

export function normalizeHistoryMessage(
  message: HistoryMessage,
): SessionEvent[] {
  const sessionId = message.session_id ?? "unknown-session";
  const createdAt = message.created_at ?? new Date().toISOString();
  const id = message.message_id ?? String(message.id ?? crypto.randomUUID());
  const textContent = textFromParts(message, isTextPartType);
  const isThoughtMessage = isThoughtKind(message.message_type);
  const thoughtContent =
    textFromParts(message, isThoughtPartType) ||
    (isThoughtMessage ? textContent : "");
  const content = textContent || thoughtContent;

  if (!content) {
    return [];
  }

  if (thoughtContent && (!textContent || isThoughtMessage)) {
    return [
      {
        type: "progress",
        id: `${id}:thought`,
        sessionId,
        content: thoughtContent,
        createdAt,
      },
    ];
  }

  const events: SessionEvent[] = [];
  if (thoughtContent) {
    events.push({
      type: "progress",
      id: `${id}:thought`,
      sessionId,
      content: thoughtContent,
      createdAt,
    });
  }

  if (!textContent) {
    return events;
  }

  events.push({
    type: message.role === "user" ? "user_message" : "agent_message",
    id,
    sessionId,
    content: textContent,
    createdAt,
  });

  return events;
}

function textFromParts(
  message: HistoryMessage,
  includePart: (partType: string) => boolean,
) {
  return [...(message.parts ?? [])]
    .sort((a, b) => a.part_index - b.part_index)
    .filter((part) => includePart(part.part_type))
    .map((part) => part.text ?? "")
    .join("");
}

function isTextPartType(partType: string) {
  return !isThoughtKind(partType) && partType === "text";
}

function isThoughtPartType(partType: string) {
  return isThoughtKind(partType);
}

function isThoughtKind(kind: string | undefined) {
  const normalized = kind?.toLowerCase();
  return [
    "agent_thought",
    "agent_thought_chunk",
    "thought",
    "thinking",
    "reasoning",
    "progress",
  ].includes(normalized ?? "");
}
