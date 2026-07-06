import { SessionEvent } from "./session-events";
import {
  createInvocationEvent,
  invocationStateFromType,
  isPaxInvocationDisplayType,
} from "./invocation-display";

type TunnelFrame = {
  id?: string | number;
  message_id?: string;
  type?: string;
  message_type?: string;
  method?: string;
  kind?: string;
  sessionUpdate?: string;
  entity_type?: string;
  event_type?: string;
  session_id?: string;
  sessionId?: string;
  role?: string;
  content?: string;
  message?: string;
  delta?: string;
  text?: string;
  label?: string;
  detail?: string;
  name?: string;
  title?: string;
  status?: string;
  path?: string;
  callId?: string;
  toolCallId?: string;
  parent_message_id?: string;
  params?: unknown;
  result?: unknown;
  output?: unknown;
  update?: unknown;
  event?: unknown;
  data?: unknown;
  raw_json?: unknown;
};

type NormalizeContext = {
  createdAt?: string;
  streamId?: string;
};

export function normalizeTunnelFrame(
  frame: unknown,
  context: NormalizeContext = {},
): SessionEvent[] {
  // UI components render one internal SessionEvent union. This adapter is the
  // only place that should know about raw tunnel frame shapes; when ACP lands,
  // update this mapper instead of teaching every component new protocol fields.
  if (!isTunnelFrame(frame)) {
    return [];
  }

  const nestedEvents = normalizeNestedFrames(frame, context);
  if (nestedEvents.length > 0) {
    return nestedEvents;
  }

  const sessionId =
    frame.session_id ??
    frame.sessionId ??
    stringFromValue(frame.params, "sessionId") ??
    stringFromValue(frame.params, "session_id") ??
    stringFromValue(frame.result, "sessionId") ??
    stringFromValue(frame.result, "session_id") ??
    "unknown-session";
  const createdAt = context.createdAt ?? new Date().toISOString();
  const kind =
    frame.event_type ??
    frame.sessionUpdate ??
    frame.kind ??
    frame.message_type ??
    frame.type ??
    frame.method;
  const id = getEventId(frame, sessionId, createdAt, context, kind);
  const content =
    extractText(frame.content) ??
    extractText(frame.message) ??
    extractText(frame.delta) ??
    extractText(frame.text);

  if (!kind) {
    return normalizeJsonRpcResult(frame, sessionId, createdAt, id);
  }

  if (isPaxInvocationDisplayType(kind)) {
    return createInvocationEvent({
      id,
      sessionId,
      createdAt,
      state: invocationStateFromType(kind),
      rawJson: frame.raw_json ?? frame,
      parentMessageId:
        frame.parent_message_id ??
        stringFromValue(frame.params, "parent_message_id"),
      fallbackContent: content,
    });
  }

  if (isIgnoredSessionUpdate(kind)) {
    return [];
  }

  if (kind === "session/request_permission") {
    return normalizePermissionRequest(frame, sessionId, createdAt, id);
  }

  if (kind === "file/changed" && frame.path) {
    return [
      {
        type: "file_change",
        id,
        sessionId,
        path: frame.path,
        createdAt,
      },
    ];
  }

  if (kind?.includes("tool")) {
    return normalizeToolCall(frame, sessionId, createdAt, id, kind);
  }

  if (kind === "usage_update") {
    const usage =
      asRecord(frame.update) ??
      asRecord(valueFrom(frame.params, "update")) ??
      asRecord(frame) ??
      asRecord(frame.params);
    return [
      {
        type: "token_usage",
        id,
        sessionId,
        totalTokens: numberFromRecord(usage, "used"),
        createdAt,
      },
    ];
  }

  if (kind?.includes("status") || kind === "session_info_update") {
    return [
      {
        type: "run_status",
        id,
        sessionId,
        status: normalizeRunStatus(frame.status),
        createdAt,
      },
    ];
  }

  if (kind === "turn/done" || kind === "turn/error") {
    return [
      {
        type: "run_status",
        id,
        sessionId,
        status: kind === "turn/error" ? "error" : "done",
        createdAt,
      },
    ];
  }

  if (content) {
    if (kind === "agent_thought_chunk") {
      return [
        {
          type: "progress",
          id,
          sessionId,
          content,
          streaming: true,
          sessionUpdate: kind,
          createdAt,
        },
      ];
    }

    return [
      {
        type: frame.role === "user" ? "user_message" : "agent_message",
        id,
        sessionId,
        content,
        streaming: isStreamingKind(kind),
        ...(frame.sessionUpdate ? { sessionUpdate: frame.sessionUpdate } : {}),
        createdAt,
      },
    ];
  }

  return [];
}

function normalizeToolCall(
  frame: TunnelFrame,
  sessionId: string,
  createdAt: string,
  id: string,
  kind: string,
) {
  const payload = firstDefined(frame.result, frame.output, frame.content);
  const status = normalizeToolStatus(frame.status, kind, payload);
  const toolCallId = toolCallIdFromFrame(frame);
  const event: Extract<SessionEvent, { type: "tool_call" }> = {
    type: "tool_call",
    id,
    sessionId,
    name:
      frame.title ??
      frame.name ??
      stringFromValue(frame.params, "title") ??
      stringFromValue(frame.params, "name") ??
      toolCallId ??
      kind,
    status,
    ...(frame.sessionUpdate ? { sessionUpdate: frame.sessionUpdate } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    createdAt,
  };

  if (
    kind === "tool_call" ||
    (kind !== "tool_call_content_chunk" &&
      (status === "running" || status === "queued"))
  ) {
    event.input = payload;
  } else if (payload !== undefined) {
    event.output = payload;
  }

  return [event] satisfies SessionEvent[];
}

function normalizePermissionRequest(
  frame: TunnelFrame,
  sessionId: string,
  createdAt: string,
  id: string,
) {
  const params = asRecord(frame.params);
  const toolCall = asRecord(params?.toolCall) ?? asRecord(params?.tool_call);
  const requestId = frame.id !== undefined ? String(frame.id) : id;
  const approvalId =
    stringFromValue(params, "approval_id") ??
    stringFromValue(params, "approvalId");
  const title =
    stringFromValue(toolCall, "title") ??
    stringFromValue(params, "title") ??
    stringFromValue(toolCall, "name") ??
    "Permission requested";
  const description =
    stringFromValue(params, "description") ??
    stringFromValue(toolCall, "description");
  const options = normalizePermissionOptions(valueFrom(params, "options"));

  return [
    {
      type: "permission_request",
      id,
      sessionId,
      approvalId,
      description,
      requestId,
      title,
      toolCallId:
        stringFromValue(toolCall, "toolCallId") ??
        stringFromValue(toolCall, "tool_call_id"),
      toolKind: stringFromValue(toolCall, "kind"),
      rawInput:
        valueFrom(toolCall, "rawInput") ?? valueFrom(toolCall, "raw_input"),
      options,
      createdAt,
    },
  ] satisfies SessionEvent[];
}

function normalizePermissionOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((option) => {
      if (typeof option === "string") {
        return { optionId: option, name: option };
      }

      const record = asRecord(option);
      const optionId =
        stringFromValue(record, "optionId") ??
        stringFromValue(record, "option_id") ??
        stringFromValue(record, "id") ??
        stringFromValue(record, "value") ??
        stringFromValue(record, "kind") ??
        stringFromValue(record, "name");
      if (!optionId) {
        return undefined;
      }

      return {
        optionId,
        kind: stringFromValue(record, "kind"),
        name:
          stringFromValue(record, "name") ??
          stringFromValue(record, "label") ??
          optionId,
      };
    })
    .filter(
      (option): option is { optionId: string; kind?: string; name: string } =>
        Boolean(option),
    );
}

function isTunnelFrame(value: unknown): value is TunnelFrame {
  return typeof value === "object" && value !== null;
}

function normalizeNestedFrames(frame: TunnelFrame, context: NormalizeContext) {
  const nestedValues =
    frame.method === "session/update"
      ? [
          withFrameContext(
            valueFrom(frame.params, "update") ??
              valueFrom(frame.params, "event") ??
              frame.params,
            frame,
          ),
        ]
      : [frame.update, frame.event, frame.data];

  const events: SessionEvent[] = [];
  for (const value of nestedValues) {
    if (value === undefined || value === frame) {
      continue;
    }

    events.push(
      ...normalizeTunnelFrame(withFrameContext(value, frame), context),
    );
  }

  return events;
}

function withFrameContext(value: unknown, parent: TunnelFrame) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const params = asRecord(parent.params);
  return {
    session_id:
      parent.session_id ??
      parent.sessionId ??
      stringFromValue(parent.params, "session_id") ??
      stringFromValue(parent.params, "sessionId"),
    sessionId:
      parent.sessionId ??
      parent.session_id ??
      stringFromValue(parent.params, "sessionId") ??
      stringFromValue(parent.params, "session_id"),
    ...(params ? { params } : {}),
    ...record,
  };
}

function stringFromValue(value: unknown, key: string) {
  const record = asRecord(value);
  const found = record?.[key];
  return typeof found === "string" ? found : undefined;
}

function valueFrom(value: unknown, key: string) {
  const record = asRecord(value);
  return record?.[key];
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined);
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function numberFromRecord(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function normalizeJsonRpcResult(
  frame: TunnelFrame,
  sessionId: string,
  createdAt: string,
  id: string,
) {
  const result = asRecord(frame.result);
  if (!result) {
    return [];
  }

  const events: SessionEvent[] = [];
  const usage = asRecord(result.usage);
  if (usage) {
    events.push({
      type: "token_usage",
      id: `${id}:usage`,
      sessionId,
      inputTokens: numberFromRecord(usage, "inputTokens"),
      outputTokens: numberFromRecord(usage, "outputTokens"),
      reasoningTokens:
        numberFromRecord(usage, "reasoningTokens") ??
        numberFromRecord(usage, "thoughtTokens"),
      totalTokens: numberFromRecord(usage, "totalTokens"),
      createdAt,
    });
  }

  const stopReason =
    stringFromValue(result, "stopReason") ??
    stringFromValue(result, "stop_reason");
  if (stopReason) {
    events.push({
      type: "run_status",
      id: `${id}:status`,
      sessionId,
      status: stopReason === "end_turn" ? "done" : "running",
      createdAt,
    });
  }

  return events;
}

function getEventId(
  frame: TunnelFrame,
  sessionId: string,
  createdAt: string,
  context: NormalizeContext,
  kind: string | undefined,
) {
  const explicitId =
    frame.id ??
    frame.message_id ??
    stringFromValue(frame.params, "id") ??
    stringFromValue(frame.params, "messageId") ??
    stringFromValue(frame.params, "message_id");

  if (explicitId !== undefined) {
    return String(explicitId);
  }

  if (kind?.includes("tool")) {
    const toolCallId = toolCallIdFromFrame(frame);
    if (toolCallId) {
      return `${sessionId}:tool:${toolCallId}`;
    }
  }

  if (isStreamingKind(kind)) {
    return [sessionId, kind, context.streamId].filter(Boolean).join(":");
  }

  return `${sessionId}:${kind ?? "event"}:${createdAt}`;
}

function isStreamingKind(kind: string | undefined) {
  return (
    kind?.includes("delta") ||
    kind?.includes("stream") ||
    kind?.endsWith("_chunk") ||
    kind === "message/delta"
  );
}

function isIgnoredSessionUpdate(kind: string | undefined) {
  if (kind === "update") {
    return true;
  }

  return Boolean(
    kind &&
    kind.endsWith("_update") &&
    !kind.includes("tool") &&
    kind !== "usage_update" &&
    kind !== "session_info_update",
  );
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value.map(extractText).filter(Boolean).join("");
    return text || undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "delta",
    "text",
    "content",
    "message",
    "newText",
    "newContent",
    "output",
  ]) {
    const text = extractText(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function toolCallIdFromFrame(frame: TunnelFrame) {
  return (
    frame.toolCallId ??
    frame.callId ??
    stringFromValue(frame.params, "toolCallId") ??
    stringFromValue(frame.params, "tool_call_id") ??
    stringFromValue(frame.params, "callId") ??
    stringFromValue(frame.params, "call_id")
  );
}

function normalizeToolStatus(
  status: string | undefined,
  kind?: string,
  payload?: unknown,
) {
  if (status === "error" || status === "queued") {
    return status;
  }

  if (
    status === "done" ||
    status === "completed" ||
    status === "complete" ||
    status === "success" ||
    status === "succeeded"
  ) {
    return "done";
  }

  if (status === "failed" || status === "failure") {
    return "error";
  }

  if (status === undefined && kind?.includes("tool_call_update") && payload) {
    return "done";
  }

  return "running";
}

function normalizeRunStatus(status: string | undefined) {
  if (
    status === "idle" ||
    status === "running" ||
    status === "waiting_approval" ||
    status === "done" ||
    status === "error"
  ) {
    return status;
  }

  return "running";
}
