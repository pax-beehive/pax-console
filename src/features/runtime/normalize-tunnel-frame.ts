import { SessionEvent } from "./session-events";

type TunnelFrame = {
  id?: string | number;
  type?: string;
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
  status?: string;
  path?: string;
  callId?: string;
  params?: unknown;
  result?: unknown;
  update?: unknown;
  event?: unknown;
  data?: unknown;
};

type NormalizeContext = {
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
  const createdAt = new Date().toISOString();
  const id = getEventId(frame, sessionId, createdAt, context);
  const kind =
    frame.event_type ??
    frame.sessionUpdate ??
    frame.kind ??
    frame.type ??
    frame.method;
  const content =
    extractText(frame.content) ??
    extractText(frame.message) ??
    extractText(frame.delta) ??
    extractText(frame.text) ??
    extractText(frame.params) ??
    extractText(frame.result);

  if (!kind && !content) {
    return [];
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
    return [
      {
        type: "tool_call",
        id,
        sessionId,
        name: frame.name ?? stringFromValue(frame.params, "name") ?? kind,
        status: normalizeToolStatus(frame.status),
        input: frame.params,
        output: frame.result,
        createdAt,
      },
    ];
  }

  if (kind === "usage_update") {
    const usage = asRecord(frame.update) ?? asRecord(frame.params) ?? asRecord(frame);
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
        streaming:
          kind?.includes("delta") ||
          kind?.includes("stream") ||
          kind?.endsWith("_chunk") ||
          kind === "message/delta",
        createdAt,
      },
    ];
  }

  return [];
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
            asRecord(frame.params) ?? frame,
          ),
        ]
      : [frame.update, frame.event, frame.data];

  const events: SessionEvent[] = [];
  for (const value of nestedValues) {
    if (value === undefined || value === frame) {
      continue;
    }

    events.push(...normalizeTunnelFrame(withFrameContext(value, frame), context));
  }

  return events;
}

function withFrameContext(value: unknown, parent: TunnelFrame) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    session_id: parent.session_id,
    sessionId: parent.sessionId,
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

function getEventId(
  frame: TunnelFrame,
  sessionId: string,
  createdAt: string,
  context: NormalizeContext,
) {
  const kind =
    frame.event_type ??
    frame.sessionUpdate ??
    frame.kind ??
    frame.type ??
    frame.method;
  const explicitId =
    frame.id ?? stringFromValue(frame.params, "id") ?? stringFromValue(frame.params, "messageId");

  if (explicitId !== undefined) {
    return String(explicitId);
  }

  if (context.streamId && kind?.endsWith("_chunk")) {
    return `${context.streamId}:${kind}`;
  }

  return `${sessionId}:${kind ?? "event"}:${createdAt}`;
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

function normalizeToolStatus(status: string | undefined) {
  if (status === "done" || status === "error" || status === "queued") {
    return status;
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
