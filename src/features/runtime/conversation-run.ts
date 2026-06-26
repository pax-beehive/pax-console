import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";

export type ConversationRunEnvelope =
  | {
      type: "session";
      node_id: string;
      agent_id: string;
      session_id: string;
    }
  | {
      type: "acp";
      node_id: string;
      agent_id: string;
      session_id: string;
      frame: unknown;
    }
  | {
      type: "done";
      node_id: string;
      agent_id: string;
      session_id: string;
    }
  | {
      type: "error";
      node_id?: string;
      agent_id?: string;
      session_id?: string;
      message: string;
    };

export type StreamConversationRunOptions = {
  agentId: string;
  input: string;
  nodeId: string;
  onEnvelope: (envelope: ConversationRunEnvelope) => void;
  sessionId?: string;
  signal?: AbortSignal;
  userId: string;
};

export async function streamConversationRun({
  agentId,
  input,
  nodeId,
  onEnvelope,
  sessionId,
  signal,
  userId,
}: StreamConversationRunOptions) {
  const response = await fetch(
    `${API_BASE_URL}${userPath(
      userId,
      `/nodes/${nodeId}/agents/${agentId}/conversation`,
    )}`,
    {
      body: JSON.stringify({
        input,
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
      credentials: "include",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "manual",
      signal,
    },
  );

  if (
    response.status === 0 ||
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400) ||
    response.type === "opaqueredirect"
  ) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  if (!response.body) {
    throw new ApiError(
      "Conversation stream did not include a response body",
      response.status,
      null,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = drainSseBuffer(buffer, onEnvelope);

    if (done) {
      break;
    }
  }

  drainSseBuffer(`${buffer}\n\n`, onEnvelope);
}

export function parseConversationRunSseBlock(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) {
    return undefined;
  }

  return JSON.parse(data) as ConversationRunEnvelope;
}

function drainSseBuffer(
  buffer: string,
  onEnvelope: (envelope: ConversationRunEnvelope) => void,
) {
  let remaining = buffer;
  let boundary = findSseBoundary(remaining);

  while (boundary) {
    const block = remaining.slice(0, boundary.index);
    remaining = remaining.slice(boundary.index + boundary.length);
    const envelope = parseConversationRunSseBlock(block);
    if (envelope) {
      onEnvelope(envelope);
    }
    boundary = findSseBoundary(remaining);
  }

  return remaining;
}

function findSseBoundary(buffer: string) {
  const unix = buffer.indexOf("\n\n");
  const windows = buffer.indexOf("\r\n\r\n");

  if (unix === -1 && windows === -1) {
    return undefined;
  }

  if (unix === -1) {
    return { index: windows, length: 4 };
  }

  if (windows === -1) {
    return { index: unix, length: 2 };
  }

  return unix < windows
    ? { index: unix, length: 2 }
    : { index: windows, length: 4 };
}

async function apiErrorFromResponse(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    const body = await response.json();
    return new ApiError(
      messageFromBody(body) ?? "PAX conversation request failed",
      response.status,
      body,
    );
  }

  const body = await response.text();
  return new ApiError(
    body || "PAX conversation request failed",
    response.status,
    body,
  );
}

function messageFromBody(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }

  const message = (body as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
}
