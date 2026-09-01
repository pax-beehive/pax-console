import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";
import type { AgentApproval, SessionApprovalMode } from "../api/types";

export type ConversationRunEnvelope =
  | {
      type: "session";
      node_id: string;
      agent_id: string;
      session_id: string;
    }
  | {
      type: "turn_started";
      node_id: string;
      agent_id: string;
      session_id: string;
      turn_id: string;
    }
  | {
      type: "acp";
      node_id: string;
      agent_id: string;
      session_id: string;
      turn_id?: string;
      frame: unknown;
    }
  | {
      type: "approval_required";
      node_id: string;
      agent_id: string;
      session_id: string;
      turn_id?: string;
      approval_id: string;
      approval?: AgentApproval;
      frame: unknown;
    }
  | {
      type: "interrupted";
      node_id?: string;
      agent_id?: string;
      session_id?: string;
      turn_id?: string;
      approval_id?: string;
      reason: string;
    }
  | {
      type: "done";
      node_id: string;
      agent_id: string;
      session_id: string;
      turn_id?: string;
    }
  | {
      type: "turn_done";
      node_id: string;
      agent_id: string;
      session_id: string;
      turn_id: string;
    }
  | {
      type: "error";
      node_id?: string;
      agent_id?: string;
      session_id?: string;
      turn_id?: string;
      status_code?: number;
      message: string;
    };

export type ConversationInputBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "attachment";
      attachment_id: string;
    };

export type StreamConversationRunOptions = {
  agentId: string;
  approvalMode?: SessionApprovalMode;
  content?: ConversationInputBlock[];
  cwd?: string;
  initializeOnly?: boolean;
  input?: string;
  nodeId: string;
  onEnvelope: (envelope: ConversationRunEnvelope) => void;
  permissionChoiceId?: string;
  primaryProjectId?: string;
  projectTargetId?: string;
  resume?: {
    approvalId: string;
  };
  sessionId?: string;
  signal?: AbortSignal;
  userId: string;
};

export async function streamConversationRun({
  agentId,
  approvalMode,
  content,
  cwd,
  initializeOnly,
  input,
  nodeId,
  onEnvelope,
  permissionChoiceId,
  primaryProjectId,
  projectTargetId,
  resume,
  sessionId,
  signal,
  userId,
}: StreamConversationRunOptions) {
  const requestContent = content && content.length > 0 ? content : undefined;

  const response = await fetch(
    `${API_BASE_URL}${userPath(
      userId,
      `/nodes/${nodeId}/agents/${agentId}/conversation`,
    )}`,
    {
      body: JSON.stringify({
        ...(initializeOnly ? { initialize_only: true } : {}),
        ...(requestContent ? { content: requestContent } : {}),
        ...(!requestContent && input ? { input } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(!sessionId && cwd ? { cwd } : {}),
        ...(!sessionId && approvalMode ? { approval_mode: approvalMode } : {}),
        ...(!sessionId && permissionChoiceId
          ? { permission_choice_id: permissionChoiceId }
          : {}),
        ...(!sessionId && primaryProjectId
          ? { primary_project_id: primaryProjectId }
          : {}),
        ...(!sessionId && projectTargetId
          ? { project_target_id: projectTargetId }
          : {}),
        ...(resume ? { resume: { approval_id: resume.approvalId } } : {}),
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

  await streamSseResponse(response, parseConversationRunSseBlock, onEnvelope);
}

export function parseConversationRunSseBlock(block: string) {
  return parseSseDataBlock<ConversationRunEnvelope>(block);
}

export async function streamSseResponse<TEnvelope>(
  response: Response,
  parseBlock: (block: string) => TEnvelope | undefined,
  onEnvelope: (envelope: TEnvelope) => void,
) {
  if (!response.body) {
    throw new ApiError(
      "Stream did not include a response body",
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
    buffer = drainSseBuffer(buffer, parseBlock, onEnvelope);

    if (done) {
      break;
    }
  }

  drainSseBuffer(`${buffer}\n\n`, parseBlock, onEnvelope);
}

export function parseSseDataBlock<TEnvelope>(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) {
    return undefined;
  }

  return JSON.parse(data) as TEnvelope;
}

function drainSseBuffer<TEnvelope>(
  buffer: string,
  parseBlock: (block: string) => TEnvelope | undefined,
  onEnvelope: (envelope: TEnvelope) => void,
) {
  let remaining = buffer;
  let boundary = findSseBoundary(remaining);

  while (boundary) {
    const block = remaining.slice(0, boundary.index);
    remaining = remaining.slice(boundary.index + boundary.length);
    const envelope = parseBlock(block);
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

  const record = body as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string") {
    return message;
  }

  return typeof record.error === "string" ? record.error : undefined;
}
