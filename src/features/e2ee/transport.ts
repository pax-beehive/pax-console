import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";
import {
  decryptEnvelope,
  encryptEnvelope,
  type EncryptedEnvelope,
} from "./envelope";

export type EncryptedEventBatch = {
  frames: unknown[];
};

export type SendEncryptedCommandOptions = {
  agentId: string;
  frame: unknown;
  keyEpoch: number;
  rootKey: Uint8Array;
  sessionId: string;
  userId: string;
};

export type PreparedEncryptedCommand = {
  commandId: string;
  envelope: EncryptedEnvelope;
};

export type StreamEncryptedEventsOptions = {
  agentId: string;
  afterCursor?: number;
  keyEpoch?: number;
  onCursor?: (cursor: number) => void;
  onFrame: (frame: unknown) => void | Promise<void>;
  rootKey: Uint8Array;
  sessionId: string;
  signal?: AbortSignal;
  userId: string;
};

export async function sendEncryptedCommand({
  agentId,
  frame,
  keyEpoch,
  rootKey,
  sessionId,
  userId,
}: SendEncryptedCommandOptions) {
  const prepared = await prepareEncryptedCommand({
    agentId,
    frame,
    keyEpoch,
    rootKey,
    sessionId,
  });
  return postEncryptedCommand({ agentId, prepared, sessionId, userId });
}

export async function prepareEncryptedCommand({
  agentId,
  frame,
  keyEpoch,
  rootKey,
  sessionId,
}: Omit<
  SendEncryptedCommandOptions,
  "userId"
>): Promise<PreparedEncryptedCommand> {
  const commandId = createRecordId("cmd");
  const envelope = await encryptEnvelope(
    rootKey,
    "command",
    {
      record_id: commandId,
      agent_id: agentId,
      session_id: sessionId,
      kind: "acp_command",
      key_epoch: keyEpoch,
    },
    new TextEncoder().encode(JSON.stringify(frame)),
  );
  return { commandId, envelope };
}

export async function postEncryptedCommand({
  agentId,
  prepared,
  sessionId,
  userId,
}: {
  agentId: string;
  prepared: PreparedEncryptedCommand;
  sessionId: string;
  userId: string;
}) {
  if (
    prepared.commandId !== prepared.envelope.record_id ||
    prepared.envelope.agent_id !== agentId ||
    prepared.envelope.session_id !== sessionId ||
    prepared.envelope.kind !== "acp_command"
  ) {
    throw new Error("Prepared encrypted command route metadata mismatch");
  }
  const response = await fetch(
    `${API_BASE_URL}${encryptedSessionPath(
      userId,
      agentId,
      sessionId,
      "encrypted-commands",
    )}`,
    {
      body: JSON.stringify(prepared.envelope),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      redirect: "manual",
    },
  );
  const body = await checkedJSONResponse<{
    command_id: string;
    created: boolean;
    status: string;
  }>(response);
  if (body.command_id !== prepared.commandId) {
    throw new ApiError("Encrypted command response ID mismatch", 502, body);
  }
  return body;
}

export async function streamEncryptedEvents({
  agentId,
  afterCursor = 0,
  keyEpoch,
  onCursor,
  onFrame,
  rootKey,
  sessionId,
  signal,
  userId,
}: StreamEncryptedEventsOptions) {
  const response = await fetch(
    `${API_BASE_URL}${encryptedSessionPath(
      userId,
      agentId,
      sessionId,
      "encrypted-events",
    )}`,
    {
      credentials: "include",
      headers: {
        Accept: "text/event-stream",
        ...(afterCursor > 0 ? { "Last-Event-ID": String(afterCursor) } : {}),
      },
      method: "GET",
      redirect: "manual",
      signal,
    },
  );
  await checkedStreamingResponse(response);
  if (!response.body) {
    throw new ApiError(
      "Encrypted event stream has no body",
      response.status,
      null,
    );
  }

  let cursor = afterCursor;
  await readSSE(response.body, async ({ data, id }) => {
    const nextCursor = Number(id);
    if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) {
      return;
    }
    const envelope = JSON.parse(data) as EncryptedEnvelope;
    if (
      envelope.agent_id !== agentId ||
      envelope.session_id !== sessionId ||
      envelope.kind !== "acp_event" ||
      (keyEpoch !== undefined && envelope.key_epoch !== keyEpoch)
    ) {
      throw new Error("Encrypted event route metadata mismatch");
    }
    const plaintext = await decryptEnvelope(rootKey, "event", envelope);
    const batch = JSON.parse(
      new TextDecoder().decode(plaintext),
    ) as EncryptedEventBatch;
    if (!Array.isArray(batch.frames)) {
      throw new Error("Encrypted event payload must contain frames");
    }
    for (const frame of batch.frames) {
      await onFrame(frame);
    }
    cursor = nextCursor;
    onCursor?.(cursor);
  });
  return cursor;
}

export async function observeEncryptedEvents(
  options: StreamEncryptedEventsOptions & {
    maxBackoffMs?: number;
  },
) {
  let cursor = options.afterCursor ?? 0;
  let backoff = 250;
  const maxBackoff = options.maxBackoffMs ?? 5_000;
  while (!options.signal?.aborted) {
    try {
      cursor = await streamEncryptedEvents({
        ...options,
        afterCursor: cursor,
        onCursor(nextCursor) {
          cursor = nextCursor;
          options.onCursor?.(nextCursor);
        },
      });
      backoff = 250;
    } catch (error) {
      if (options.signal?.aborted || !isRetryableStreamError(error)) {
        throw error;
      }
    }
    await abortableDelay(backoff, options.signal);
    backoff = Math.min(maxBackoff, backoff * 2);
  }
  return cursor;
}

async function readSSE(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: { data: string; id: string }) => Promise<void>,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const drained = await drainSSE(buffer, onEvent);
    buffer = drained.remaining;
    if (done) {
      break;
    }
  }
  await drainSSE(`${buffer}\n\n`, onEvent);
}

async function drainSSE(
  buffer: string,
  onEvent: (event: { data: string; id: string }) => Promise<void>,
) {
  let remaining = buffer;
  while (true) {
    const match = /\r?\n\r?\n/.exec(remaining);
    if (!match || match.index === undefined) {
      break;
    }
    const block = remaining.slice(0, match.index);
    remaining = remaining.slice(match.index + match[0].length);
    const event = parseSSEBlock(block);
    if (event) {
      await onEvent(event);
    }
  }
  return { remaining };
}

function parseSSEBlock(block: string) {
  let id = "";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("id:")) {
      id = line.slice(3).trimStart();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  return id && data.length > 0 ? { id, data: data.join("\n") } : undefined;
}

function encryptedSessionPath(
  userId: string,
  agentId: string,
  sessionId: string,
  suffix: "encrypted-commands" | "encrypted-events",
) {
  return userPath(
    userId,
    `/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/${suffix}`,
  );
}

async function checkedJSONResponse<T>(response: Response) {
  await checkedResponseStatus(response);
  const body = (await response.json()) as {
    code: number;
    data: T;
    message?: string;
  };
  if (body.code >= 400) {
    throw new ApiError(
      body.message ?? "Encrypted command failed",
      body.code,
      body,
    );
  }
  return body.data;
}

async function checkedStreamingResponse(response: Response) {
  await checkedResponseStatus(response);
  if (!response.ok) {
    throw new ApiError(await response.text(), response.status, null);
  }
}

async function checkedResponseStatus(response: Response) {
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
    throw new ApiError(await response.text(), response.status, null);
  }
}

function isRetryableStreamError(error: unknown) {
  return (
    !(error instanceof AuthError) &&
    (!(error instanceof ApiError) ||
      [408, 429, 502, 503, 504].includes(error.status))
  );
}

function abortableDelay(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRecordId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
