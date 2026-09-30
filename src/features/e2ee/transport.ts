import {
  withEncryptedPromptContext,
  type EncryptedPromptCache,
} from "./history-context";
import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";
import type { HistoryMessage, MessagePart } from "../api/types";
import {
  decryptEnvelope,
  encryptEnvelope,
  type EncryptedEnvelope,
} from "./envelope";

export type EncryptedEventBatch = {
  turn_id?: string;
  frames: unknown[];
};

export type EncryptedEventContext = {
  turnId?: string;
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
  onFrame: (
    frame: unknown,
    context: EncryptedEventContext,
  ) => void | Promise<void>;
  rootKey: Uint8Array;
  sessionId: string;
  signal?: AbortSignal;
  userId: string;
};

export type LoadEncryptedHistoryOptions = {
  signal?: AbortSignal;
  promptCache?: EncryptedPromptCache;
  agentId: string;
  beforeId?: number;
  keyEpoch?: number;
  limit?: number;
  rootKey: Uint8Array;
  sessionId: string;
  userId: string;
};

export type EncryptedHistoryPage = {
  messages: HistoryMessage[];
  pagination: {
    has_more: boolean;
    next_before_id: number;
  };
};

export function flattenEncryptedHistoryPages(
  pages?: EncryptedHistoryPage[],
): HistoryMessage[] {
  const messagesById = new Map<string, HistoryMessage>();
  for (const message of (pages ?? []).flatMap((page) => page.messages)) {
    const current = messagesById.get(message.message_id);
    const canonical =
      !current || encryptedRevision(message) >= encryptedRevision(current)
        ? message
        : current;
    messagesById.set(message.message_id, {
      ...canonical,
      parts: canonicalEncryptedParts([
        ...(current?.parts ?? []),
        ...(message.parts ?? []),
      ]),
    });
  }

  return [...messagesById.values()].sort(compareEncryptedHistoryMessages);
}

function canonicalEncryptedParts(parts: MessagePart[]) {
  const partsByIndex = new Map<number, MessagePart>();
  for (const part of parts) {
    const current = partsByIndex.get(part.part_index);
    if (!current || encryptedRevision(part) >= encryptedRevision(current)) {
      partsByIndex.set(part.part_index, part);
    }
  }
  return [...partsByIndex.values()].sort(
    (left, right) => left.part_index - right.part_index,
  );
}

function compareEncryptedHistoryMessages(
  left: HistoryMessage,
  right: HistoryMessage,
) {
  if (left.id !== undefined && right.id !== undefined && left.id !== right.id) {
    return left.id - right.id;
  }
  const createdOrder = (left.created_at ?? "").localeCompare(
    right.created_at ?? "",
  );
  return createdOrder || left.message_id.localeCompare(right.message_id);
}

function encryptedRevision(value: { revision?: number }) {
  return value.revision ?? 0;
}

type StoredEncryptedHistoryPart = {
  id: number;
  part_index: number;
  revision: number;
  envelope: EncryptedEnvelope;
  created_at: string;
  updated_at: string;
};

type StoredEncryptedHistoryMessage = {
  id: number;
  message_id: string;
  revision: number;
  envelope: EncryptedEnvelope;
  parts: StoredEncryptedHistoryPart[];
  created_at: string;
  updated_at: string;
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

export async function loadEncryptedSessionHistory(
  options: LoadEncryptedHistoryOptions,
): Promise<EncryptedHistoryPage> {
  const base = await loadEncryptedHistoryPage(options);
  return withEncryptedPromptContext(
    base,
    (beforeId) => loadEncryptedHistoryPage({ ...options, beforeId }),
    options.promptCache,
  );
}

async function loadEncryptedHistoryPage({
  agentId,
  beforeId = 0,
  signal,
  keyEpoch,
  limit = 500,
  rootKey,
  sessionId,
  userId,
}: LoadEncryptedHistoryOptions): Promise<EncryptedHistoryPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId > 0) {
    params.set("before_id", String(beforeId));
  }
  const body = await checkedJSONResponse<{
    messages: StoredEncryptedHistoryMessage[] | null;
    pagination?: {
      has_more?: boolean;
      next_before_id?: number;
    };
  }>(
    await fetch(
      `${API_BASE_URL}${encryptedSessionPath(
        userId,
        agentId,
        sessionId,
        "encrypted-history",
      )}?${params}`,
      {
        credentials: "include",
        signal,
        method: "GET",
        redirect: "manual",
      },
    ),
  );

  const messages = await Promise.all(
    (body.messages ?? []).map(async (stored) => {
      validateStoredHistoryEnvelope(
        stored.envelope,
        "e2ee_message",
        agentId,
        sessionId,
        keyEpoch,
      );
      const message = decodeJSON<HistoryMessage & { revision: number }>(
        await decryptEnvelope(rootKey, "event", stored.envelope),
      );
      if (
        message.message_id !== stored.message_id ||
        message.revision !== stored.revision ||
        message.agent_id !== agentId ||
        message.session_id !== sessionId
      ) {
        throw new Error("Encrypted history message metadata mismatch");
      }
      const parts = await Promise.all(
        [...stored.parts]
          .sort((left, right) => left.part_index - right.part_index)
          .map(async (storedPart) => {
            validateStoredHistoryEnvelope(
              storedPart.envelope,
              "e2ee_message_part",
              agentId,
              sessionId,
              keyEpoch,
            );
            const part = decodeJSON<MessagePart & { revision: number }>(
              await decryptEnvelope(rootKey, "event", storedPart.envelope),
            );
            if (
              part.message_id !== stored.message_id ||
              part.part_index !== storedPart.part_index ||
              part.revision !== storedPart.revision
            ) {
              throw new Error("Encrypted history part metadata mismatch");
            }
            return {
              ...part,
              id: storedPart.id,
              created_at: part.created_at ?? storedPart.created_at,
              updated_at: part.updated_at ?? storedPart.updated_at,
            };
          }),
      );
      return {
        ...message,
        id: stored.id,
        created_at: message.created_at ?? stored.created_at,
        updated_at: message.updated_at ?? stored.updated_at,
        parts,
      };
    }),
  );

  return {
    messages,
    pagination: {
      has_more: body.pagination?.has_more ?? false,
      next_before_id: body.pagination?.next_before_id ?? 0,
    },
  };
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
    const context = {
      turnId:
        typeof batch.turn_id === "string" && batch.turn_id.trim()
          ? batch.turn_id
          : undefined,
    } satisfies EncryptedEventContext;
    for (const frame of batch.frames) {
      await onFrame(frame, context);
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
  suffix: "encrypted-commands" | "encrypted-events" | "encrypted-history",
) {
  return userPath(
    userId,
    `/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/${suffix}`,
  );
}

function validateStoredHistoryEnvelope(
  envelope: EncryptedEnvelope,
  kind: "e2ee_message" | "e2ee_message_part",
  agentId: string,
  sessionId: string,
  keyEpoch?: number,
) {
  if (
    envelope.kind !== kind ||
    envelope.agent_id !== agentId ||
    envelope.session_id !== sessionId ||
    (keyEpoch !== undefined && envelope.key_epoch !== keyEpoch)
  ) {
    throw new Error("Encrypted history route metadata mismatch");
  }
}

function decodeJSON<T>(plaintext: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
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
