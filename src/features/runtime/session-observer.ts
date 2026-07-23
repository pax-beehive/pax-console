"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent } from "./session-events";
import { parseSseDataBlock, streamSseResponse } from "./conversation-run";
import {
  appendSessionEvents,
  useBufferedSessionEvents,
} from "./use-buffered-session-events";

export type SessionObserverEnvelope =
  | {
      type: "acp";
      agent_id?: string;
      frame: unknown;
      message_id?: string;
      node_id?: string;
      session_id: string;
      turn_id?: string;
    }
  | {
      type: "buffer_miss";
      agent_id?: string;
      message?: string;
      message_id?: string;
      node_id?: string;
      session_id: string;
      status?: string;
    }
  | {
      type: "no_running_turn";
      agent_id?: string;
      node_id?: string;
      session_id: string;
      status?: string;
    }
  | {
      type: "turn_done";
      agent_id?: string;
      node_id?: string;
      session_id: string;
      status?: string;
      turn_id?: string;
    }
  | {
      type: "error";
      agent_id?: string;
      message: string;
      node_id?: string;
      session_id?: string;
    };

export type SessionObserverStatus =
  | "idle"
  | "observing"
  | "no_running_turn"
  | "done"
  | "error";

type StreamSessionObserverOptions = {
  afterMessageId?: string;
  agentId: string;
  onEnvelope: (envelope: SessionObserverEnvelope) => void;
  sessionId: string;
  signal?: AbortSignal;
  userId: string;
};

type UseSessionObserverOptions = {
  afterMessageId?: string;
  agentId?: string;
  enabled?: boolean;
  followQueuedTurn?: boolean;
  onBufferMiss?: () => void;
  onNoRunningTurn?: () => void;
  onQueuedTurnStarted?: () => void;
  onQueuedTurnFinished?: () => void;
  onQueuedTurnUnavailable?: () => void;
  onTurnDone?: () => void;
  sessionId?: string;
  userId: string;
};

export async function streamSessionObserver({
  afterMessageId,
  agentId,
  onEnvelope,
  sessionId,
  signal,
  userId,
}: StreamSessionObserverOptions) {
  const params = new URLSearchParams();
  if (afterMessageId) {
    params.set("after_message_id", afterMessageId);
  }
  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}${userPath(
      userId,
      `/agents/${agentId}/sessions/${sessionId}/events`,
    )}${query ? `?${query}` : ""}`,
    {
      credentials: "include",
      headers: {
        Accept: "text/event-stream",
      },
      method: "GET",
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
    throw await observerErrorFromResponse(response);
  }

  await streamSseResponse(response, parseSessionObserverSseBlock, onEnvelope);
}

export async function streamSessionObserverWithQueuedReplay({
  followQueuedTurn = false,
  maxQueuedTurnAttempts = 20,
  onQueuedTurnStarted,
  onQueuedTurnFinished,
  onQueuedTurnUnavailable,
  retryDelayMs = 150,
  ...options
}: StreamSessionObserverOptions & {
  followQueuedTurn?: boolean;
  maxQueuedTurnAttempts?: number;
  onQueuedTurnStarted?: () => void;
  onQueuedTurnFinished?: () => void;
  onQueuedTurnUnavailable?: () => void;
  retryDelayMs?: number;
}) {
  let followUpAvailable = followQueuedTurn;
  let waitingForFollowUp = false;
  let followUpStarted = false;
  let remainingAttempts = maxQueuedTurnAttempts;

  while (!options.signal?.aborted) {
    let terminalType: "error" | "no_running_turn" | "turn_done" | undefined;
    await streamSessionObserver({
      ...options,
      afterMessageId: waitingForFollowUp ? undefined : options.afterMessageId,
      onEnvelope: (envelope) => {
        options.onEnvelope(envelope);
        if (waitingForFollowUp && envelope.type === "acp") {
          waitingForFollowUp = false;
          followUpAvailable = false;
          followUpStarted = true;
          onQueuedTurnStarted?.();
        }
        if (
          envelope.type === "no_running_turn" ||
          envelope.type === "turn_done"
        ) {
          terminalType = envelope.type;
        } else if (envelope.type === "error") {
          terminalType = "error";
        }
      },
    });

    if (options.signal?.aborted) {
      return;
    }
    if (!terminalType) {
      throw new SessionObserverDisconnectedError();
    }
    if (terminalType === "turn_done" && followUpAvailable) {
      waitingForFollowUp = true;
    } else if (terminalType === "no_running_turn" && followUpAvailable) {
      waitingForFollowUp = true;
    } else {
      if (terminalType === "turn_done" && followUpStarted) {
        onQueuedTurnFinished?.();
      }
      return;
    }
    if (remainingAttempts <= 0) {
      onQueuedTurnUnavailable?.();
      return;
    }
    remainingAttempts -= 1;
    await waitForQueuedTurnRetry(retryDelayMs);
  }
}

export async function streamSessionObserverWithReconnect({
  maxReconnectAttempts = Number.POSITIVE_INFINITY,
  onReconnect,
  reconnectDelayMs = 500,
  reconnectMaxDelayMs = 5_000,
  ...options
}: Parameters<typeof streamSessionObserverWithQueuedReplay>[0] & {
  maxReconnectAttempts?: number;
  onReconnect?: (attempt: number, error: Error) => void;
  reconnectDelayMs?: number;
  reconnectMaxDelayMs?: number;
}) {
  let attempt = 0;
  let delayMs = Math.max(0, reconnectDelayMs);

  while (!options.signal?.aborted) {
    try {
      await streamSessionObserverWithQueuedReplay(options);
      return;
    } catch (caught) {
      if (options.signal?.aborted) {
        return;
      }
      const error =
        caught instanceof Error ? caught : new Error(String(caught));
      if (
        !isRetriableSessionObserverError(error) ||
        attempt >= maxReconnectAttempts
      ) {
        throw error;
      }
      attempt += 1;
      onReconnect?.(attempt, error);
      await waitForObserverRetry(delayMs, options.signal);
      delayMs = Math.min(
        Math.max(delayMs * 2, reconnectDelayMs),
        reconnectMaxDelayMs,
      );
    }
  }
}

export function parseSessionObserverSseBlock(block: string) {
  return parseSseDataBlock<SessionObserverEnvelope>(block);
}

export function useSessionObserver({
  afterMessageId,
  agentId,
  enabled = true,
  followQueuedTurn,
  onBufferMiss,
  onNoRunningTurn,
  onQueuedTurnStarted,
  onQueuedTurnFinished,
  onQueuedTurnUnavailable,
  onTurnDone,
  sessionId,
  userId,
}: UseSessionObserverOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<SessionObserverStatus>("idle");
  const {
    append: appendEvents,
    events,
    flush: flushEvents,
    reset: resetEvents,
  } = useBufferedSessionEvents();
  const canObserve = Boolean(enabled && agentId && sessionId);

  useEffect(() => {
    abortRef.current?.abort();

    if (!enabled || !agentId || !sessionId) {
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    const streamId = [
      sessionId,
      "observe",
      afterMessageId ?? "head",
      Date.now(),
    ].join(":");

    globalThis.queueMicrotask(() => {
      if (abortController.signal.aborted) {
        return;
      }
      setError(null);
      resetEvents();
      setStatus("observing");
    });

    void streamSessionObserverWithReconnect({
      afterMessageId,
      agentId,
      followQueuedTurn,
      onEnvelope: (envelope) =>
        handleSessionObserverEnvelope(envelope, {
          onBufferMiss,
          onNoRunningTurn,
          onTurnDone,
          setError,
          appendEvents,
          setStatus,
          streamId,
        }),
      sessionId,
      signal: abortController.signal,
      userId,
      onQueuedTurnStarted,
      onQueuedTurnFinished,
      onQueuedTurnUnavailable,
      onReconnect: () => {
        setError(null);
        setStatus("observing");
      },
    })
      .then(flushEvents)
      .catch((caught) => {
        if (abortController.signal.aborted) {
          return;
        }
        const nextError =
          caught instanceof Error ? caught : new Error(String(caught));
        setError(nextError);
        setStatus("error");
      });

    return () => {
      abortController.abort();
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
    };
  }, [
    afterMessageId,
    agentId,
    appendEvents,
    enabled,
    flushEvents,
    followQueuedTurn,
    onBufferMiss,
    onNoRunningTurn,
    onQueuedTurnStarted,
    onQueuedTurnFinished,
    onQueuedTurnUnavailable,
    onTurnDone,
    resetEvents,
    sessionId,
    userId,
  ]);

  return {
    error: canObserve ? error : null,
    events: canObserve ? events : [],
    status: canObserve ? status : "idle",
  };
}

export function handleSessionObserverEnvelope(
  envelope: SessionObserverEnvelope,
  {
    onBufferMiss,
    onNoRunningTurn,
    onTurnDone,
    setError,
    appendEvents,
    setEvents,
    setStatus,
    streamId,
  }: {
    onBufferMiss?: () => void;
    onNoRunningTurn?: () => void;
    onTurnDone?: () => void;
    setError: Dispatch<SetStateAction<Error | null>>;
    appendEvents?: (events: SessionEvent[]) => void;
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
    setStatus: Dispatch<SetStateAction<SessionObserverStatus>>;
    streamId: string;
  },
) {
  if (envelope.type === "acp") {
    setStatus("observing");
    const events = normalizeTunnelFrame(
      withEnvelopeSession(envelope.frame, envelope.session_id),
      { streamId },
    );
    if (events.length > 0) {
      appendObserverEvents({ appendEvents, setEvents }, events);
    }
    return;
  }

  if (envelope.type === "buffer_miss") {
    onBufferMiss?.();
    return;
  }

  if (envelope.type === "no_running_turn") {
    setStatus("no_running_turn");
    onNoRunningTurn?.();
    return;
  }

  if (envelope.type === "turn_done") {
    appendObserverEvents({ appendEvents, setEvents }, [
      {
        type: "run_status",
        id: `${envelope.session_id}:observer:${envelope.turn_id ?? "turn"}:done`,
        sessionId: envelope.session_id,
        status: "done",
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus("done");
    onTurnDone?.();
    return;
  }

  if (envelope.type === "error") {
    const nextError = new Error(envelope.message);
    nextError.name = "SessionObserverError";
    setError(nextError);
    setStatus("error");
    return;
  }
}

function waitForQueuedTurnRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, delayMs));
  });
}

class SessionObserverDisconnectedError extends Error {
  constructor() {
    super("Session observer stream disconnected before the turn completed");
    this.name = "SessionObserverDisconnectedError";
  }
}

export function isRetriableSessionObserverError(error: Error) {
  return (
    error instanceof TypeError ||
    error instanceof SessionObserverDisconnectedError ||
    (error instanceof ApiError &&
      [408, 429, 502, 503, 504].includes(error.status))
  );
}

function waitForObserverRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted || delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeoutId = globalThis.setTimeout(done, delayMs);
    signal?.addEventListener("abort", done, { once: true });

    function done() {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}

function appendObserverEvents(
  target: {
    appendEvents?: (events: SessionEvent[]) => void;
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
  },
  incoming: SessionEvent[],
) {
  if (target.appendEvents) {
    target.appendEvents(incoming);
    return;
  }
  target.setEvents?.((current) => appendSessionEvents(current, incoming));
}

function withEnvelopeSession(frame: unknown, sessionId: string) {
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
    return frame;
  }

  const record = frame as Record<string, unknown>;
  const params =
    typeof record.params === "object" &&
    record.params !== null &&
    !Array.isArray(record.params)
      ? { ...(record.params as Record<string, unknown>), sessionId }
      : { sessionId };

  return {
    ...record,
    params,
    session_id:
      typeof record.session_id === "string" ? record.session_id : sessionId,
  };
}

async function observerErrorFromResponse(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    const body = await response.json();
    return new ApiError(
      messageFromBody(body) ?? "PAX session observer request failed",
      response.status,
      body,
    );
  }

  const body = await response.text();
  return new ApiError(
    body || "PAX session observer request failed",
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
