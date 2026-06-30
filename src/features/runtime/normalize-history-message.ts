import { HistoryMessage } from "@/features/api/types";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent } from "./session-events";

export function normalizeHistoryMessage(
  message: HistoryMessage,
): SessionEvent[] {
  const sessionId = message.session_id ?? "unknown-session";
  const createdAt = message.created_at ?? new Date().toISOString();
  const id = message.message_id ?? String(message.id ?? crypto.randomUUID());
  if (message.message_type === "permission_response") {
    const events = normalizePermissionResponse(message, sessionId, createdAt);
    if (events.length > 0) {
      return events;
    }
  }

  const frameEvents = normalizeHistoryFrames(message, sessionId, createdAt);
  if (frameEvents.length > 0) {
    return frameEvents;
  }

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

function normalizePermissionResponse(
  message: HistoryMessage,
  sessionId: string,
  createdAt: string,
) {
  const events: SessionEvent[] = [];
  for (const candidate of historyFrameCandidates(message)) {
    const frame = unwrapHistoryFrame(candidate);
    const record = asRecord(frame);
    const requestId =
      stringFromValue(record, "id") ?? numberStringFromValue(record, "id");
    const result = asRecord(record?.result);
    const outcome = asRecord(result?.outcome);
    const decisionOption =
      stringFromValue(outcome, "optionId") ??
      stringFromValue(outcome, "option_id");

    if (!requestId || !decisionOption) {
      continue;
    }

    events.push({
      type: "permission_decision",
      id: `${message.message_id ?? requestId}:permission_decision`,
      sessionId,
      requestId,
      decision: {
        decisionOption,
        status: decisionOption.includes("deny") ? "denied" : "approved",
      },
      createdAt,
    });
  }

  return events;
}

function normalizeHistoryFrames(
  message: HistoryMessage,
  sessionId: string,
  createdAt: string,
) {
  const events: SessionEvent[] = [];
  for (const candidate of historyFrameCandidates(message)) {
    events.push(
      ...normalizeTunnelFrame(withHistorySession(candidate, sessionId), {
        createdAt,
      }),
    );
  }

  return events;
}

function historyFrameCandidates(message: HistoryMessage) {
  const candidates: unknown[] = [];
  if (message.raw_json) {
    candidates.push(message.raw_json);
  }

  for (const part of message.parts ?? []) {
    if (part.payload_json) {
      candidates.push(part.payload_json);
    }

    const parsed = parseJSONPartText(part.text);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  return candidates;
}

function parseJSONPartText(text: string | undefined) {
  if (!text?.trim().startsWith("{")) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function withHistorySession(candidate: unknown, sessionId: string) {
  const frame = unwrapHistoryFrame(candidate);
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
    return frame;
  }

  return {
    session_id: sessionId,
    sessionId,
    ...frame,
  };
}

function unwrapHistoryFrame(candidate: unknown) {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return candidate;
  }

  const record = candidate as Record<string, unknown>;
  if (record.type === "acp" && record.frame) {
    const frame = record.frame;
    if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
      return frame;
    }

    return {
      session_id:
        typeof record.session_id === "string" ? record.session_id : undefined,
      sessionId:
        typeof record.session_id === "string" ? record.session_id : undefined,
      ...(frame as Record<string, unknown>),
    };
  }

  return candidate;
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function stringFromValue(value: unknown, key: string) {
  const record = asRecord(value);
  const found = record?.[key];
  return typeof found === "string" ? found : undefined;
}

function numberStringFromValue(value: unknown, key: string) {
  const record = asRecord(value);
  const found = record?.[key];
  return typeof found === "number" ? String(found) : undefined;
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
