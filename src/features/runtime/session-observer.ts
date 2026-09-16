"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { HistoryMessage } from "@/features/api/types";
import { API_BASE_URL, userPath } from "../api/client";
import { ApiError, AuthError } from "../api/errors";
import {
  normalizeHistoryMessages,
  normalizeHistoryMessage,
} from "./normalize-history-message";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent } from "./session-events";
import { parseSseDataBlock, streamSseResponse } from "./conversation-run";
import {
  appendSessionEvents,
  useBufferedSessionEvents,
} from "./use-buffered-session-events";

export type SessionObserverEnvelope =
  | { type: "turn_start"; session_id: string; turn_id: string }
  | {
      type: "history_remove";
      session_id: string;
      turn_id: string;
      message_id: string;
    }
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
      turn_id?: string;
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
      turn_id?: string;
    }
  // seq refactor: durable catch-up item replayed on (re)connect.
  | {
      type: "history_item";
      agent_id?: string;
      node_id?: string;
      session_id: string;
      turn_id?: string;
      message_id?: string;
      seq?: number;
      item?: HistoryMessage;
    }
  // seq refactor: current head watermark / resync-after-overflow signal.
  | {
      type: "head" | "resync";
      agent_id?: string;
      node_id?: string;
      session_id?: string;
      head_seq?: number;
      turn_id?: string;
      message?: string;
    };

export type SessionObserverStatus =
  | "idle"
  | "observing"
  | "no_running_turn"
  | "done"
  | "error";

export type ObserverTranscript = {
  sessionId?: string;
  turnIds: string[];
  events: SessionEvent[];
  pendingTurnId?: string;
  items: Record<string, HistoryMessage>;
  dirty?: boolean;
};

const emptyObserverTranscript: ObserverTranscript = {
  turnIds: [],
  events: [],
  items: {},
};

export function applyObserverTranscript(
  current: ObserverTranscript,
  envelope: SessionObserverEnvelope,
): ObserverTranscript {
  if (envelope.type === "turn_start") {
    const previous =
      current.sessionId === envelope.session_id
        ? current
        : emptyObserverTranscript;
    return {
      ...previous,
      sessionId: envelope.session_id,
      pendingTurnId: envelope.turn_id,
      items: {},
      dirty: true,
    };
  }
  if (
    envelope.type === "history_item" &&
    envelope.item &&
    envelope.session_id === current.sessionId &&
    envelope.turn_id === current.pendingTurnId &&
    envelope.item.session_id === current.sessionId &&
    envelope.item.turn_id === current.pendingTurnId &&
    envelope.item.message_id
  ) {
    return {
      ...current,
      dirty: true,
      items: { ...current.items, [envelope.item.message_id]: envelope.item },
    };
  }
  if (
    envelope.type === "history_remove" &&
    envelope.session_id === current.sessionId &&
    envelope.turn_id === current.pendingTurnId
  ) {
    const items = { ...current.items };
    delete items[envelope.message_id];
    return { ...current, items, dirty: true };
  }
  if (
    envelope.type !== "head" ||
    envelope.session_id !== current.sessionId ||
    !envelope.turn_id ||
    envelope.turn_id !== current.pendingTurnId
  )
    return current;
  if (!current.dirty) return current;
  const turnId = envelope.turn_id;
  const messages = Object.values(current.items).sort(
    (a, b) => (a.session_seq ?? 0) - (b.session_seq ?? 0),
  );
  if (messages.length === 0 && !current.turnIds.includes(turnId)) {
    return { ...current, dirty: false };
  }
  return {
    ...current,
    dirty: false,
    turnIds: [...new Set([...current.turnIds, turnId])],
    events: [
      ...current.events.filter((event) => event.turnId !== turnId),
      ...normalizeHistoryMessages(messages),
    ],
  };
}

type StreamSessionObserverOptions = {
  afterSeq?: number;
  turnId?: string;
  agentId: string;
  onConnected?: () => void;
  onEnvelope: (envelope: SessionObserverEnvelope) => void;
  sessionId: string;
  signal?: AbortSignal;
  userId: string;
};

type UseSessionObserverOptions = {
  afterSeq?: number;
  turnId?: string;
  agentId?: string;
  enabled?: boolean;
  followQueuedTurn?: boolean;
  onBufferMiss?: () => void;
  onConnected?: () => void;
  onNoRunningTurn?: () => void;
  onQueuedTurnStarted?: () => void;
  onQueuedTurnFinished?: () => void;
  onQueuedTurnUnavailable?: () => void;
  onTurnDone?: (turnId?: string) => void;
  sessionId?: string;
  userId: string;
};

export async function streamSessionObserver({
  afterSeq,
  turnId,
  agentId,
  onConnected,
  onEnvelope,
  sessionId,
  signal,
  userId,
}: StreamSessionObserverOptions) {
  const params = new URLSearchParams();
  if (turnId) params.set("turn_id", turnId);
  if (afterSeq !== undefined) params.set("after_seq", String(afterSeq));
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

  onConnected?.();
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
      afterSeq: waitingForFollowUp ? undefined : options.afterSeq,
      turnId: waitingForFollowUp ? undefined : options.turnId,
      onEnvelope: (envelope) => {
        options.onEnvelope(envelope);
        if (
          waitingForFollowUp &&
          (envelope.type === "acp" || envelope.type === "turn_start")
        ) {
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
  let pinnedTurnId = options.turnId;
  let afterSeq = options.afterSeq;
  let delayMs = Math.max(0, reconnectDelayMs);

  while (!options.signal?.aborted) {
    try {
      await streamSessionObserverWithQueuedReplay({
        ...options,
        turnId: pinnedTurnId,
        afterSeq,
        onEnvelope: (envelope) => {
          options.onEnvelope(envelope);
          if (envelope.type === "turn_start") {
            if (pinnedTurnId !== envelope.turn_id) afterSeq = undefined;
            pinnedTurnId = envelope.turn_id;
          }
          if (envelope.type === "head" && envelope.turn_id === pinnedTurnId) {
            afterSeq = envelope.head_seq;
          }
          if (envelope.type === "resync")
            throw new SessionObserverDisconnectedError();
        },
      });
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
  afterSeq,
  turnId,
  agentId,
  enabled = true,
  followQueuedTurn,
  onBufferMiss,
  onConnected,
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
  const [transcript, setTranscript] = useState<ObserverTranscript>(
    emptyObserverTranscript,
  );
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
      turnId ?? "active",
      String(afterSeq ?? 0),
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
      afterSeq,
      turnId,
      agentId,
      followQueuedTurn,
      onConnected,
      onEnvelope: (envelope) => {
        if (abortController.signal.aborted) return;
        if (
          ["turn_start", "history_item", "history_remove", "head"].includes(
            envelope.type,
          )
        ) {
          setTranscript((current) =>
            applyObserverTranscript(current, envelope),
          );
          return;
        }
        handleSessionObserverEnvelope(envelope, {
          onBufferMiss,
          onNoRunningTurn,
          onTurnDone,
          setError,
          appendEvents,
          setStatus,
          streamId,
        });
      },
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
    afterSeq,
    turnId,
    agentId,
    appendEvents,
    enabled,
    flushEvents,
    followQueuedTurn,
    onBufferMiss,
    onConnected,
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
    events:
      transcript.sessionId === sessionId && transcript.turnIds.length
        ? transcript.events
        : canObserve
          ? events
          : [],
    snapshotTurnIds:
      transcript.sessionId === sessionId ? transcript.turnIds : [],
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
    onTurnDone?: (turnId?: string) => void;
    setError: Dispatch<SetStateAction<Error | null>>;
    appendEvents?: (events: SessionEvent[]) => void;
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
    setStatus: Dispatch<SetStateAction<SessionObserverStatus>>;
    streamId: string;
  },
) {
  if (envelope.type === "acp") {
    setStatus("observing");
    const events = withObserverTurn(
      normalizeTunnelFrame(
        withEnvelopeSession(envelope.frame, envelope.session_id),
        { streamId },
      ),
      envelope.turn_id,
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
        type: "turn_done",
        id: `${envelope.session_id}:observer:${envelope.turn_id ?? "turn"}:done`,
        sessionId: envelope.session_id,
        ...(envelope.turn_id ? { turnId: envelope.turn_id } : {}),
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus("done");
    onTurnDone?.(envelope.turn_id);
    return;
  }

  if (envelope.type === "history_item") {
    // Durable catch-up replayed on (re)connect: normalize like history and let
    // the seq-keyed merge dedup it against anything already rendered.
    if (envelope.item) {
      const events = normalizeHistoryMessage(envelope.item);
      if (events.length > 0) {
        appendObserverEvents({ appendEvents, setEvents }, events);
      }
    }
    return;
  }

  if (envelope.type === "head" || envelope.type === "resync") {
    // Snapshot heads are committed by the transcript reducer. Resync is
    // handled by the reconnect loop and stays pinned to the same turn.
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

function withObserverTurn(events: SessionEvent[], turnId?: string) {
  return turnId
    ? events.map((event) => ({ ...event, turnId }) as SessionEvent)
    : events;
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
