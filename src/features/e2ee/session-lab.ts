import type { EncryptedAttachment } from "./attachments";
export type E2EEPromptFrame = {
  jsonrpc: "2.0";
  id: string;
  method: "session/prompt";
  params: {
    sessionId: string;
    prompt: Array<{ type: "text"; text: string }>;
    paxEncryptedAttachments?: EncryptedAttachment[];
  };
};

export type E2EESessionNewFrame = {
  jsonrpc: "2.0";
  id: string;
  method: "session/new";
  params: {
    cwd: string;
    mcpServers: [];
  };
};

export type E2EECancelFrame = {
  jsonrpc: "2.0";
  method: "session/cancel";
  params: { sessionId: string };
};

export type E2EERPCResponse = {
  error?: string;
  requestId: string;
};

export function buildE2EESessionNewFrame(
  requestId: string,
  cwd: string,
): E2EESessionNewFrame {
  return {
    jsonrpc: "2.0",
    id: requireValue(requestId, "Request ID"),
    method: "session/new",
    params: {
      cwd: requireValue(cwd, "Working directory"),
      mcpServers: [],
    },
  };
}

export function buildE2EEPromptFrame(
  requestId: string,
  sessionId: string,
  prompt: string,
  attachments: EncryptedAttachment[] = [],
): E2EEPromptFrame {
  const normalizedRequestId = requireValue(requestId, "Request ID");
  const normalizedSessionId = requireValue(sessionId, "Session ID");
  const normalizedPrompt = attachments.length
    ? prompt.trim()
    : requireValue(prompt, "Prompt");

  return {
    jsonrpc: "2.0",
    id: normalizedRequestId,
    method: "session/prompt",
    params: {
      sessionId: normalizedSessionId,
      prompt: normalizedPrompt
        ? [{ type: "text", text: normalizedPrompt }]
        : [],
      ...(attachments.length ? { paxEncryptedAttachments: attachments } : {}),
    },
  };
}

export function buildE2EECancelFrame(sessionId: string): E2EECancelFrame {
  return {
    jsonrpc: "2.0",
    method: "session/cancel",
    params: { sessionId: requireValue(sessionId, "Session ID") },
  };
}

export function extractE2EEFrameText(frame: unknown) {
  if (!isRecord(frame)) {
    return "";
  }
  const params = recordValue(frame.params);
  const update = recordValue(params?.update);
  const content = recordValue(update?.content);
  const frameContent = recordValue(frame.content);

  return firstString(
    content?.text,
    update?.text,
    update?.delta,
    frameContent?.text,
    frame.text,
    frame.delta,
    typeof frame.content === "string" ? frame.content : undefined,
  );
}

export function parseE2EERPCResponse(
  frame: unknown,
): E2EERPCResponse | undefined {
  if (
    !isRecord(frame) ||
    (typeof frame.id !== "string" && typeof frame.id !== "number")
  ) {
    return undefined;
  }
  if (!("result" in frame) && !("error" in frame)) {
    return undefined;
  }

  const error = recordValue(frame.error);
  return {
    requestId: String(frame.id),
    error: firstString(error?.message) || undefined,
  };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireValue(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}
