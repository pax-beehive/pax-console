import { HistoryMessage } from "@/features/api/types";
import { SessionEvent } from "./session-events";

export const PAX_INVOCATION_MESSAGE_TYPE = "pax:invocation";
export const PAX_INVOCATION_PENDING_MESSAGE_TYPE = "pax:invocation_pending";
export type InvocationState = "complete" | "pending";

export type InvocationDisplayInput = {
  id: string;
  sessionId: string;
  createdAt: string;
  state?: InvocationState;
  rawJson?: unknown;
  parentMessageId?: string;
  fallbackContent?: string;
};

export function isPaxInvocationType(kind: string | undefined) {
  return kind === PAX_INVOCATION_MESSAGE_TYPE;
}

export function isPaxInvocationDisplayType(kind: string | undefined) {
  return (
    kind === PAX_INVOCATION_MESSAGE_TYPE ||
    kind === PAX_INVOCATION_PENDING_MESSAGE_TYPE
  );
}

export function invocationStateFromType(kind: string | undefined) {
  return kind === PAX_INVOCATION_PENDING_MESSAGE_TYPE ? "pending" : "complete";
}

export function projectHistoryMessagesForDisplay(
  messages: HistoryMessage[],
): HistoryMessage[] {
  const messageIds = new Set(messages.map((message) => message.message_id));
  const invocationIds = new Set<string>();
  const hiddenMessageIds = new Set<string>();
  const invocationsByAnchorId = new Map<string, HistoryMessage[]>();

  for (const message of messages) {
    if (!isPaxInvocationDisplayType(message.message_type)) {
      continue;
    }

    invocationIds.add(message.message_id);
    const parentMessageId = message.parent_message_id;
    const replacesMessageIds = invocationReplacesMessageIds(message.raw_json);
    for (const replacedId of replacesMessageIds.length > 0
      ? replacesMessageIds
      : parentMessageId
        ? [parentMessageId]
        : []) {
      hiddenMessageIds.add(replacedId);
    }

    const anchorMessageId =
      parentMessageId && messageIds.has(parentMessageId)
        ? parentMessageId
        : replacesMessageIds.find((messageId) => messageIds.has(messageId));
    if (anchorMessageId) {
      invocationsByAnchorId.set(anchorMessageId, [
        ...(invocationsByAnchorId.get(anchorMessageId) ?? []),
        message,
      ]);
    }
  }

  const projected: HistoryMessage[] = [];
  const insertedInvocationIds = new Set<string>();

  for (const message of messages) {
    const anchoredInvocations = invocationsByAnchorId.get(message.message_id);
    if (anchoredInvocations) {
      for (const invocation of anchoredInvocations) {
        if (hiddenMessageIds.has(invocation.message_id)) {
          continue;
        }

        projected.push(invocation);
        insertedInvocationIds.add(invocation.message_id);
      }
    }

    if (invocationIds.has(message.message_id)) {
      if (hiddenMessageIds.has(message.message_id)) {
        continue;
      }

      if (
        !insertedInvocationIds.has(message.message_id) &&
        (!message.parent_message_id ||
          !messageIds.has(message.parent_message_id))
      ) {
        projected.push(message);
        insertedInvocationIds.add(message.message_id);
      }
      continue;
    }

    if (hiddenMessageIds.has(message.message_id)) {
      continue;
    }

    projected.push(message);
  }

  return projected;
}

export function createInvocationEvent({
  id,
  sessionId,
  createdAt,
  state = "complete",
  rawJson,
  parentMessageId,
  fallbackContent,
}: InvocationDisplayInput): SessionEvent[] {
  const invocationRawJson = unwrapInvocationRawJson(rawJson);
  const content = invocationDisplayText(invocationRawJson) ?? fallbackContent;
  if (!content) {
    return [];
  }
  const side = stringFromValue(invocationRawJson, "side");
  const sender =
    endpointFromValue(valueFrom(invocationRawJson, "sender")) ??
    inferredEndpointFromText(content, side, "sender");
  const receiver =
    endpointFromValue(valueFrom(invocationRawJson, "receiver")) ??
    inferredEndpointFromText(content, side, "receiver");

  return [
    {
      type: "invocation",
      id,
      sessionId,
      content,
      originalContent: invocationOriginalText(invocationRawJson),
      invocationId: stringFromValue(invocationRawJson, "invocation_id"),
      invocationType: stringFromValue(invocationRawJson, "invocation_type"),
      phase: stringFromValue(invocationRawJson, "phase"),
      state,
      side,
      parentMessageId,
      replacesMessageIds: invocationReplacesMessageIds(invocationRawJson),
      sender,
      receiver,
      createdAt,
    },
  ];
}

export function invocationDisplayText(rawJson: unknown) {
  return (
    stringFromValue(valueFrom(rawJson, "content"), "display_text") ??
    stringFromValue(rawJson, "display_text") ??
    stringFromValue(rawJson, "message")
  );
}

export function invocationOriginalText(rawJson: unknown) {
  return (
    stringFromValue(valueFrom(rawJson, "content"), "original_text") ??
    stringFromValue(rawJson, "original_text")
  );
}

export function invocationReplacesMessageIds(rawJson: unknown) {
  const replaces = valueFrom(
    unwrapInvocationRawJson(rawJson),
    "replaces_message_ids",
  );
  if (!Array.isArray(replaces)) {
    return [];
  }

  return replaces.filter(
    (messageId): messageId is string => typeof messageId === "string",
  );
}

function unwrapInvocationRawJson(rawJson: unknown): unknown {
  const parsed = parseJsonString(rawJson);
  const paxInvocation = valueFrom(parsed, "pax_invocation");
  if (paxInvocation) {
    return parseJsonString(paxInvocation);
  }

  const nestedRawJson = valueFrom(parsed, "raw_json");
  if (nestedRawJson) {
    return unwrapInvocationRawJson(nestedRawJson);
  }

  return parsed;
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function inferredEndpointFromText(
  content: string,
  side: string | undefined,
  endpoint: "sender" | "receiver",
) {
  const agentId = content.match(/\bagent_[A-Za-z0-9]+\b/)?.[0];
  if (!agentId) {
    return undefined;
  }

  if (side === "target" && endpoint === "sender") {
    return { agentId };
  }

  if (side === "source" && endpoint === "receiver") {
    return { agentId };
  }

  return undefined;
}

function endpointFromValue(value: unknown) {
  const agentId = stringFromValue(value, "agent_id");
  const representativeAgentId = stringFromValue(
    value,
    "representative_agent_id",
  );
  const agentName =
    stringFromValue(value, "agent_name") ??
    stringFromValue(value, "agent_display_name") ??
    stringFromValue(value, "display_name") ??
    stringFromValue(value, "name");
  const sessionId = stringFromValue(value, "session_id");
  const userName =
    stringFromValue(value, "agent_user_name") ??
    stringFromValue(value, "user_name") ??
    stringFromValue(value, "user_display_name") ??
    stringFromValue(value, "owner_user_name") ??
    stringFromValue(value, "username") ??
    stringFromValue(value, "user_email") ??
    stringFromValue(value, "owner_user_email");
  if (
    !agentId &&
    !representativeAgentId &&
    !agentName &&
    !sessionId &&
    !userName
  ) {
    return undefined;
  }

  return {
    agentId,
    agentName,
    representativeAgentId,
    sessionId,
    userName,
  };
}

function valueFrom(value: unknown, key: string) {
  const record = asRecord(value);
  return record?.[key];
}

function stringFromValue(value: unknown, key: string) {
  const record = asRecord(value);
  const found = record?.[key];
  return typeof found === "string" ? found : undefined;
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
