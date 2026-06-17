import { SessionEvent } from "./session-events";

type TunnelFrame = {
  id?: string;
  type?: string;
  method?: string;
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
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

export function normalizeTunnelFrame(frame: unknown): SessionEvent[] {
  // UI components render one internal SessionEvent union. This adapter is the
  // only place that should know about raw tunnel frame shapes; when ACP lands,
  // update this mapper instead of teaching every component new protocol fields.
  if (!isTunnelFrame(frame)) {
    return [];
  }

  if (frame.method === "session/update" && frame.params) {
    const nestedEvents = normalizeTunnelFrame(frame.params);
    if (nestedEvents.length > 0) {
      return nestedEvents;
    }
  }

  const sessionId =
    frame.session_id ??
    frame.sessionId ??
    stringFromRecord(frame.params, "sessionId") ??
    stringFromRecord(frame.params, "session_id") ??
    "unknown-session";
  const createdAt = new Date().toISOString();
  const id = frame.id ?? `${sessionId}:${createdAt}`;
  const kind = frame.event_type ?? frame.type ?? frame.method;
  const content =
    frame.content ??
    frame.message ??
    frame.delta ??
    frame.text ??
    extractText(frame.params) ??
    stringFromRecord(frame.params, "content") ??
    stringFromRecord(frame.result, "content");

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
        name: frame.name ?? stringFromRecord(frame.params, "name") ?? kind,
        status: normalizeToolStatus(frame.status),
        input: frame.params,
        output: frame.result,
        createdAt,
      },
    ];
  }

  if (kind?.includes("status")) {
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
    return [
      {
        type: frame.role === "user" ? "user_message" : "agent_message",
        id,
        sessionId,
        content,
        streaming:
          kind?.includes("delta") ||
          kind?.includes("stream") ||
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

function stringFromRecord(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
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
  for (const key of ["delta", "text", "content", "newText", "newContent"]) {
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
