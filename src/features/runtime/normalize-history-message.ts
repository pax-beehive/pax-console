import { HistoryMessage } from "@/features/api/types";
import {
  createInvocationEvent,
  invocationStateFromType,
  isPaxInvocationDisplayType,
  projectHistoryMessagesForDisplay,
} from "./invocation-display";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent, type SessionMessageAttachment } from "./session-events";

export function normalizeHistoryMessages(
  messages: HistoryMessage[],
): SessionEvent[] {
  return finalizeHistoryTextChunks(
    orderAggregatedHistoryText(
      mergeAdjacentHistoryTextChunks(
        projectHistoryMessagesForDisplay(messages).flatMap((message) =>
          normalizeHistoryMessage(message),
        ),
      ),
    ),
  );
}

/**
 * The durable history store aggregates every agent_message_chunk in a turn
 * into one message row. That row keeps the ID/created_at of the first chunk,
 * even though its text eventually contains the final answer emitted after the
 * turn's tool calls. Keep live streams in receipt order, but place this
 * history-only aggregate immediately before the durable turn boundary.
 */
function orderAggregatedHistoryText(events: SessionEvent[]) {
  const completedTurnIds = new Set(
    events
      .filter((event) => event.type === "turn_done" && event.turnId)
      .map((event) => event.turnId as string),
  );
  const deferredByTurn = new Map<string, SessionEvent[]>();

  for (const event of events) {
    if (
      event.type !== "agent_message" ||
      !event.turnId ||
      !completedTurnIds.has(event.turnId) ||
      !["agent_message_chunk", "message_delta"].includes(
        event.sessionUpdate ?? "",
      )
    ) {
      continue;
    }

    deferredByTurn.set(event.turnId, [
      ...(deferredByTurn.get(event.turnId) ?? []),
      event,
    ]);
  }

  if (deferredByTurn.size === 0) {
    return events;
  }

  const ordered: SessionEvent[] = [];
  const placedTurnIds = new Set<string>();
  for (const event of events) {
    if (
      event.type === "agent_message" &&
      event.turnId &&
      deferredByTurn.get(event.turnId)?.includes(event)
    ) {
      continue;
    }

    if (
      event.type === "turn_done" &&
      event.turnId &&
      !placedTurnIds.has(event.turnId)
    ) {
      ordered.push(...(deferredByTurn.get(event.turnId) ?? []));
      placedTurnIds.add(event.turnId);
    }
    ordered.push(event);
  }

  return ordered;
}

export function normalizeHistoryMessage(
  message: HistoryMessage,
): SessionEvent[] {
  const attachments =
    message.role === "user" ? historyPromptAttachments(message) : [];
  const events = normalizeHistoryMessageWithoutTurn(message).map((event) =>
    event.type === "user_message" && attachments.length > 0
      ? { ...event, attachments }
      : event,
  );
  if (
    events.length === 0 &&
    message.role === "user" &&
    attachments.length > 0
  ) {
    events.push({
      type: "user_message",
      id: message.message_id,
      sessionId: message.session_id ?? "unknown-session",
      content: "",
      attachments,
      createdAt: message.created_at ?? new Date().toISOString(),
    });
  }
  if (!message.turn_id) {
    return events;
  }
  return events.map((event) => ({ ...event, turnId: message.turn_id }));
}

function historyPromptAttachments(
  message: HistoryMessage,
): SessionMessageAttachment[] {
  const attachments = new Map<string, SessionMessageAttachment>();
  for (const candidate of historyFrameCandidates(message)) {
    const frame = asRecord(unwrapHistoryFrame(candidate));
    if (frame?.method !== "session/prompt") continue;
    const prompt = asRecord(frame.params)?.prompt;
    if (!Array.isArray(prompt)) continue;
    for (const block of prompt) {
      const resource = asRecord(block);
      if (resource?.type !== "resource_link") continue;
      const filename = stringFromValue(resource, "name");
      const uri = stringFromValue(resource, "uri");
      if (!filename || !uri) continue;
      attachments.set(uri, {
        attachmentId: attachmentIdFromLocalURI(uri),
        filename,
        contentType: stringFromValue(resource, "mimeType"),
      });
    }
  }
  return [...attachments.values()];
}

function attachmentIdFromLocalURI(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") return undefined;
    // Paxd stores each uploaded file directly inside its attachment ID directory.
    const directory = url.pathname.split("/").at(-2);
    return directory && /^att_[a-f0-9]{48}$/.test(directory)
      ? directory
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHistoryMessageWithoutTurn(
  message: HistoryMessage,
): SessionEvent[] {
  const sessionId = message.session_id ?? "unknown-session";
  const createdAt = message.created_at ?? new Date().toISOString();
  const id = message.message_id ?? String(message.id ?? crypto.randomUUID());
  if (isPaxInvocationDisplayType(message.message_type)) {
    return createInvocationEvent({
      id,
      sessionId,
      createdAt,
      state: invocationStateFromType(message.message_type),
      rawJson: message.raw_json,
      parentMessageId: message.parent_message_id,
      fallbackContent: textFromParts(message, isTextPartType),
    });
  }

  if (message.message_type === "pax:artifact") {
    const artifacts = normalizeArtifactPublicationMessage(
      message,
      sessionId,
      createdAt,
      id,
    );
    if (artifacts.length > 0) {
      return artifacts;
    }
  }

  if (message.message_type === "permission_response") {
    const events = normalizePermissionResponse(message, sessionId, createdAt);
    if (events.length > 0) {
      return events;
    }
  }

  if (message.message_type === "turn_done") {
    return [
      {
        type: "turn_done",
        id,
        sessionId,
        createdAt,
      },
    ];
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
        ...historyTextChunkMetadata(message.message_type),
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
      ...historyTextChunkMetadata(message.message_type),
      createdAt,
    });
  }

  if (!textContent) {
    return events;
  }

  events.push(
    message.role === "user"
      ? {
          type: "user_message",
          id,
          sessionId,
          content: textContent,
          createdAt,
        }
      : {
          type: "agent_message",
          id,
          sessionId,
          content: textContent,
          ...historyTextChunkMetadata(message.message_type),
          createdAt,
        },
  );

  return events;
}

function mergeAdjacentHistoryTextChunks(events: SessionEvent[]) {
  const merged: SessionEvent[] = [];

  for (const event of events) {
    const previous = merged.at(-1);
    if (
      isHistoryTextChunk(previous) &&
      isHistoryTextChunk(event) &&
      previous.type === event.type &&
      previous.sessionId === event.sessionId &&
      previous.turnId === event.turnId &&
      previous.sessionUpdate === event.sessionUpdate
    ) {
      previous.content += event.content;
      continue;
    }

    merged.push(event);
  }

  return merged;
}

function finalizeHistoryTextChunks(events: SessionEvent[]) {
  return events.map((event) => {
    if (event.type !== "agent_message" && event.type !== "progress") {
      return event;
    }

    return event.streaming ? { ...event, streaming: false } : event;
  });
}

function isHistoryTextChunk(
  event: SessionEvent | undefined,
): event is Extract<SessionEvent, { type: "agent_message" | "progress" }> {
  if (event?.type !== "agent_message" && event?.type !== "progress") {
    return false;
  }

  return (
    event.streaming === true &&
    ["agent_message_chunk", "agent_thought_chunk", "message_delta"].includes(
      event.sessionUpdate ?? "",
    )
  );
}

function historyTextChunkMetadata(messageType: string | undefined) {
  if (
    !["agent_message_chunk", "agent_thought_chunk", "message_delta"].includes(
      messageType ?? "",
    )
  ) {
    return {};
  }

  return {
    sessionUpdate: messageType,
    streaming: true,
  } as const;
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

    const source = permissionDecisionSource(record);
    events.push({
      type: "permission_decision",
      id: `${message.message_id ?? requestId}:permission_decision`,
      sessionId,
      requestId,
      decision: {
        decisionOption,
        ...(source ? { source } : {}),
        status: isRejectedPermissionOption(decisionOption)
          ? "denied"
          : "approved",
      },
      createdAt,
    });
  }

  return events;
}

function isRejectedPermissionOption(optionId: string) {
  const normalized = optionId.toLowerCase();
  return normalized.includes("deny") || normalized.includes("reject");
}

function permissionDecisionSource(record: Record<string, unknown> | undefined) {
  const grantBody = asRecord(record?.grant_body) ?? asRecord(record?.grantBody);
  const approvalMode =
    stringFromValue(grantBody, "approval_mode") ??
    stringFromValue(grantBody, "approvalMode");
  if (approvalMode === "auto_approve_all") {
    return "auto" as const;
  }

  const decidedByUserId =
    stringFromValue(record, "decided_by_user_id") ??
    stringFromValue(record, "decidedByUserId");
  return decidedByUserId ? ("user" as const) : undefined;
}

function normalizeHistoryFrames(
  message: HistoryMessage,
  sessionId: string,
  createdAt: string,
) {
  const events: SessionEvent[] = [];
  const aggregatedTerminalOutput =
    message.message_type === "tool_call_update"
      ? textFromParts(message, isTextPartType)
      : "";
  for (const candidate of historyFrameCandidates(message)) {
    const candidateEvents = normalizeTunnelFrame(
      withHistorySession(candidate, sessionId),
      { createdAt },
    );
    events.push(
      ...candidateEvents.map((event) =>
        aggregatedTerminalOutput &&
        event.type === "tool_call" &&
        event.outputMode === "append"
          ? {
              ...event,
              output: aggregatedTerminalOutput,
              outputMode: "replace" as const,
            }
          : event,
      ),
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

function normalizeArtifactPublicationMessage(
  message: HistoryMessage,
  sessionId: string,
  createdAt: string,
  id: string,
): SessionEvent[] {
  const events: SessionEvent[] = [];
  const parts = [...(message.parts ?? [])].sort(
    (a, b) => a.part_index - b.part_index,
  );

  for (const part of parts) {
    if (part.part_type !== "artifact") {
      continue;
    }

    const payload = asRecord(part.payload_json);
    const publicationId =
      stringFromValue(payload, "publication_id") ??
      publicationIdFromArtifactUri(part.artifact_uri);
    if (!publicationId) {
      continue;
    }

    events.push({
      type: "artifact_publication",
      id: `${id}:artifact:${part.part_index}:${publicationId}`,
      sessionId,
      publicationId,
      contentRef: artifactContentRef(part.artifact_uri),
      ...(part.artifact_uri ? { artifactUri: part.artifact_uri } : {}),
      createdAt,
    });
  }

  return events;
}

function publicationIdFromArtifactUri(value: string | undefined) {
  const match = /^artifact-publication:\/\/([^/]+)\//.exec(value ?? "");
  return match?.[1];
}

function artifactContentRef(value: string | undefined) {
  const match = /^artifact-publication:\/\/[^/]+\/(.+)$/.exec(value ?? "");
  return match?.[1] ?? "main";
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
