"use client";

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConversationRunEnvelope,
  streamConversationRun,
} from "./conversation-run";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent, type SessionMessageAttachment } from "./session-events";
import {
  appendSessionEvents,
  useBufferedSessionEvents,
} from "./use-buffered-session-events";
import type { ApprovalOption, SessionApprovalMode } from "../api/types";
import { ApiError } from "../api/errors";
import { isConversationObserverRecoverableError } from "./session-display-status";

export type ConversationRunStatus =
  | "idle"
  | "streaming"
  | "waiting_approval"
  | "done"
  | "cancelled"
  | "error";

type UseConversationRunOptions = {
  agentId?: string;
  nodeId?: string;
  onSession?: (sessionId: string) => void;
  onTurnEnd?: (turnId?: string) => void;
  runtimeSnapshot?: { status?: string; turnId?: string };
  sessionId?: string;
  userId: string;
};

type SendMessageOptions = {
  approvalMode?: SessionApprovalMode;
  attachmentIds?: string[];
  attachments?: SessionMessageAttachment[];
  onAccepted?: () => void;
  cwd?: string;
  permissionChoiceId?: string;
  primaryProjectId?: string;
  projectTargetId?: string;
};

type InitializeSessionOptions = Omit<
  SendMessageOptions,
  "attachmentIds" | "attachments" | "onAccepted"
>;

export function useConversationRun({
  agentId,
  nodeId,
  onSession,
  onTurnEnd,
  runtimeSnapshot,
  sessionId,
  userId,
}: UseConversationRunOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  const activeTurnIdRef = useRef<string | undefined>(undefined);
  const [activeTurnId, setActiveTurnId] = useState<string>();
  const serverObservedTurnRef = useRef<string | undefined>(undefined);
  const completedTurnKeysRef = useRef(new Set<string>());
  const [status, setStatus] = useState<ConversationRunStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [transportInterrupted, setTransportInterrupted] = useState(false);
  const [completedTurnVersion, setCompletedTurnVersion] = useState(0);
  const {
    append: appendEvents,
    events,
    flush: flushEvents,
    update: updateEvents,
  } = useBufferedSessionEvents();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const markTurnCompleted = useCallback((turnKey: string) => {
    if (completedTurnKeysRef.current.has(turnKey)) {
      return;
    }
    completedTurnKeysRef.current.add(turnKey);
    setCompletedTurnVersion((current) => current + 1);
  }, []);

  const sendMessage = useCallback(
    async (input: string, options?: SendMessageOptions) => {
      if (!agentId || !nodeId) {
        throw new Error("Select a node and agent before sending a prompt");
      }

      const content = input.trim();
      const attachmentIds = [...new Set(options?.attachmentIds ?? [])].filter(
        Boolean,
      );
      if (!content && attachmentIds.length === 0) {
        throw new Error("Prompt cannot be empty");
      }

      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const promptSessionId = sessionIdRef.current;
      const optimisticSessionId = promptSessionId ?? "pending-session";
      const startedAt = Date.now();
      const optimisticTurnId = `pending-turn:${startedAt}`;
      const streamId = `${optimisticSessionId}:turn:${startedAt}`;
      activeTurnIdRef.current = optimisticTurnId;
      setActiveTurnId(optimisticTurnId);
      serverObservedTurnRef.current = undefined;
      let accepted = false;

      setError(null);
      setTransportInterrupted(false);
      setStatus("streaming");
      if (content || attachmentIds.length > 0) {
        appendEvents([
          {
            type: "user_message",
            id: `${optimisticSessionId}:user:${Date.now()}`,
            sessionId: optimisticSessionId,
            turnId: optimisticTurnId,
            content,
            ...(options?.attachments?.length
              ? {
                  attachments: options.attachments.map((attachment) => ({
                    ...attachment,
                  })),
                }
              : {}),
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      flushEvents();

      try {
        await streamConversationRun({
          agentId,
          approvalMode: promptSessionId ? undefined : options?.approvalMode,
          cwd: promptSessionId ? undefined : options?.cwd,
          permissionChoiceId: promptSessionId
            ? undefined
            : options?.permissionChoiceId,
          ...(attachmentIds.length > 0
            ? {
                content: [
                  ...(content
                    ? ([{ type: "text", text: content }] as const)
                    : []),
                  ...attachmentIds.map((attachmentId) => ({
                    type: "attachment" as const,
                    attachment_id: attachmentId,
                  })),
                ],
              }
            : { input: content }),
          nodeId,
          onEnvelope: (envelope) => {
            if (abortController.signal.aborted) return;
            if (envelope.type === "turn_started" && !accepted) {
              accepted = true;
              options?.onAccepted?.();
            }
            const envelopeError = handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              appendEvents,
              fallbackTurnId: activeTurnIdRef.current,
              onTurnStarted: (turnId) => {
                activeTurnIdRef.current = turnId;
                setActiveTurnId(turnId);
              },
              onTurnEnd,
              onTurnDone: (turnId) => {
                markTurnCompleted(turnId ?? streamId);
              },
              setStatus,
              streamId,
              updateEvents,
            });
            if (envelopeError) {
              throw envelopeError;
            }
          },
          primaryProjectId: promptSessionId
            ? undefined
            : options?.primaryProjectId,
          projectTargetId: promptSessionId
            ? undefined
            : options?.projectTargetId,
          sessionId: promptSessionId,
          signal: abortController.signal,
          userId,
        });

        if (abortController.signal.aborted)
          return { sessionId: sessionIdRef.current };
        flushEvents();
        setStatus((current) =>
          current === "waiting_approval" || current === "error"
            ? current
            : "done",
        );
        return { sessionId: sessionIdRef.current };
      } catch (caught) {
        if (abortController.signal.aborted) {
          return { sessionId: sessionIdRef.current };
        }

        const nextError =
          caught instanceof Error ? caught : new Error(String(caught));
        if (isConversationObserverRecoverableError(nextError)) {
          setError(nextError);
          setTransportInterrupted(true);
          return { sessionId: sessionIdRef.current };
        }
        setError(nextError);
        setStatus("error");
        throw nextError;
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
      }
    },
    [
      agentId,
      appendEvents,
      flushEvents,
      nodeId,
      onSession,
      onTurnEnd,
      markTurnCompleted,
      updateEvents,
      userId,
    ],
  );

  const initializeSession = useCallback(
    async (options?: InitializeSessionOptions) => {
      if (!agentId || !nodeId) {
        throw new Error("Select a node and agent before creating a session");
      }
      if (sessionIdRef.current) {
        throw new Error("The session is already initialized");
      }

      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const streamId = `pending-session:initialize:${Date.now()}`;

      setError(null);
      setTransportInterrupted(false);
      setStatus("streaming");

      try {
        await streamConversationRun({
          agentId,
          approvalMode: options?.approvalMode,
          cwd: options?.cwd,
          initializeOnly: true,
          nodeId,
          onEnvelope: (envelope) => {
            const envelopeError = handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              appendEvents,
              setStatus,
              streamId,
              updateEvents,
            });
            if (envelopeError) {
              throw envelopeError;
            }
          },
          permissionChoiceId: options?.permissionChoiceId,
          primaryProjectId: options?.primaryProjectId,
          projectTargetId: options?.projectTargetId,
          signal: abortController.signal,
          userId,
        });
        flushEvents();
        setStatus((current) => (current === "error" ? current : "done"));
        return { sessionId: sessionIdRef.current };
      } catch (caught) {
        if (abortController.signal.aborted) {
          return { sessionId: sessionIdRef.current };
        }
        const nextError =
          caught instanceof Error ? caught : new Error(String(caught));
        setError(nextError);
        setStatus("error");
        throw nextError;
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
      }
    },
    [
      agentId,
      appendEvents,
      flushEvents,
      nodeId,
      onSession,
      updateEvents,
      userId,
    ],
  );

  const resumePermission = useCallback(
    async (approvalId: string) => {
      if (!agentId || !nodeId) {
        throw new Error("Select a node and agent before resuming a session");
      }

      const currentSessionId = sessionIdRef.current;
      if (!currentSessionId) {
        throw new Error(
          "Start the session before resuming a permission request",
        );
      }

      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const streamId = `${currentSessionId}:resume:${approvalId}:${Date.now()}`;

      setError(null);
      setTransportInterrupted(false);
      setStatus("streaming");

      try {
        await streamConversationRun({
          agentId,
          nodeId,
          onEnvelope: (envelope) => {
            if (abortController.signal.aborted) return;
            const envelopeError = handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              appendEvents,
              fallbackTurnId: activeTurnIdRef.current,
              onTurnStarted: (turnId) => {
                activeTurnIdRef.current = turnId;
                setActiveTurnId(turnId);
              },
              onTurnEnd,
              onTurnDone: (turnId) => {
                markTurnCompleted(turnId ?? streamId);
              },
              setStatus,
              streamId,
              updateEvents,
            });
            if (envelopeError) {
              throw envelopeError;
            }
          },
          resume: { approvalId },
          sessionId: currentSessionId,
          signal: abortController.signal,
          userId,
        });

        if (abortController.signal.aborted)
          return { sessionId: sessionIdRef.current };
        flushEvents();
        setStatus((current) =>
          current === "waiting_approval" || current === "error"
            ? current
            : "done",
        );
        return { sessionId: sessionIdRef.current };
      } catch (caught) {
        if (abortController.signal.aborted) {
          return { sessionId: sessionIdRef.current };
        }

        const nextError =
          caught instanceof Error ? caught : new Error(String(caught));
        if (isConversationObserverRecoverableError(nextError)) {
          setError(nextError);
          setTransportInterrupted(true);
          return { sessionId: sessionIdRef.current };
        }
        setError(nextError);
        setStatus("error");
        throw nextError;
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
      }
    },
    [
      agentId,
      appendEvents,
      flushEvents,
      nodeId,
      onSession,
      onTurnEnd,
      markTurnCompleted,
      updateEvents,
      userId,
    ],
  );

  const markCancelled = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setTransportInterrupted(false);
    setStatus("cancelled");
  }, []);

  const markObserverConnected = useCallback(() => {
    setError(null);
  }, []);

  const finishObservedTurn = useCallback((turnId?: string) => {
    if (turnId && activeTurnIdRef.current && turnId !== activeTurnIdRef.current)
      return;
    if (turnId && !activeTurnIdRef.current) {
      activeTurnIdRef.current = turnId;
      setActiveTurnId(turnId);
    }
    setError(null);
    setTransportInterrupted(false);
    setStatus((current) => (current === "cancelled" ? current : "done"));
  }, []);

  useEffect(() => {
    if (
      !activeTurnId ||
      activeTurnId.startsWith("pending-turn:") ||
      runtimeSnapshot?.turnId !== activeTurnId
    )
      return;
    if (
      runtimeSnapshot.status === "running" ||
      runtimeSnapshot.status === "waiting_approval"
    ) {
      serverObservedTurnRef.current = activeTurnId;
    } else if (
      runtimeSnapshot.status === "idle" &&
      serverObservedTurnRef.current === activeTurnId &&
      (status === "streaming" || status === "waiting_approval")
    ) {
      // A pre-submit idle snapshot must not cancel a newly submitted prompt.
      finishObservedTurn(activeTurnId);
    }
  }, [
    activeTurnId,
    runtimeSnapshot?.status,
    runtimeSnapshot?.turnId,
    status,
    finishObservedTurn,
  ]);

  return {
    activeTurnId,
    error,
    events,
    completedTurnVersion,
    finishObservedTurn,
    initializeSession,
    markCancelled,
    markObserverConnected,
    resumePermission,
    sendMessage,
    status: agentId && nodeId ? status : "idle",
    transportInterrupted,
  };
}

export function handleConversationEnvelope(
  envelope: ConversationRunEnvelope,
  {
    onSession,
    setError,
    appendEvents,
    fallbackTurnId,
    onTurnStarted,
    onTurnEnd,
    onTurnDone,
    setEvents,
    setStatus,
    streamId,
    updateEvents,
  }: {
    onSession: (sessionId: string) => void;
    setError: Dispatch<SetStateAction<Error | null>>;
    appendEvents?: (events: SessionEvent[]) => void;
    fallbackTurnId?: string;
    onTurnStarted?: (turnId: string) => void;
    onTurnEnd?: (turnId?: string) => void;
    onTurnDone?: (turnId?: string) => void;
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
    setStatus: Dispatch<SetStateAction<ConversationRunStatus>>;
    streamId: string;
    updateEvents?: (update: (events: SessionEvent[]) => SessionEvent[]) => void;
  },
) {
  if (envelope.type === "session") {
    updateConversationEvents({ setEvents, updateEvents }, (current) =>
      current.map((event) =>
        reassignPendingSession(event, envelope.session_id),
      ),
    );
    onSession(envelope.session_id);
    return;
  }

  adoptConversationTurn(
    { setEvents, updateEvents },
    fallbackTurnId,
    envelope.turn_id,
    onTurnStarted,
  );

  if (envelope.type === "turn_started") {
    appendConversationEvents({ appendEvents, setEvents }, [
      {
        type: "run_status",
        id: `${envelope.session_id}:turn:${envelope.turn_id}:started`,
        sessionId: envelope.session_id,
        turnId: envelope.turn_id,
        status: "running",
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus("streaming");
    return;
  }

  if (envelope.type === "acp") {
    const events = withConversationTurn(
      normalizeTunnelFrame(
        withEnvelopeSession(envelope.frame, envelope.session_id),
        {
          streamId,
        },
      ),
      envelope.turn_id ?? fallbackTurnId,
    );
    if (events.length > 0) {
      appendConversationEvents({ appendEvents, setEvents }, events);
    }
    if (events.some((event) => event.type === "turn_done")) {
      onTurnEnd?.(envelope.turn_id ?? fallbackTurnId);
      setStatus((current) =>
        current === "error" || current === "cancelled" ? current : "done",
      );
    }
    return;
  }

  if (envelope.type === "approval_required") {
    const events = withConversationTurn(
      normalizeTunnelFrame(
        withEnvelopeSession(envelope.frame, envelope.session_id),
        {
          streamId,
        },
      ).map((event) =>
        event.type === "permission_request"
          ? withApproval(event, envelope)
          : event,
      ),
      envelope.turn_id ?? fallbackTurnId,
    );
    if (events.length > 0) {
      appendConversationEvents({ appendEvents, setEvents }, events);
    }
    setStatus("waiting_approval");
    return;
  }

  if (envelope.type === "interrupted") {
    if (envelope.reason === "permission_required") {
      setStatus("waiting_approval");
      return;
    }

    throw new Error(`Conversation interrupted: ${envelope.reason}`);
  }

  if (envelope.type === "turn_done") {
    const turnId = envelope.turn_id;
    appendConversationEvents({ appendEvents, setEvents }, [
      {
        type: "turn_done",
        id: turnId
          ? `${envelope.session_id}:turn:${turnId}:done`
          : `${envelope.session_id}:done`,
        sessionId: envelope.session_id,
        ...(turnId ? { turnId } : {}),
        createdAt: new Date().toISOString(),
      },
    ]);
    onTurnDone?.(turnId);
    setStatus((current) => (current === "error" ? current : "done"));
    return;
  }

  if (envelope.type === "done") {
    setStatus((current) =>
      current === "error" ||
      current === "cancelled" ||
      current === "waiting_approval"
        ? current
        : "done",
    );
    return;
  }

  if (envelope.type === "error") {
    if (envelope.session_id) {
      onSession(envelope.session_id);
    }
    const nextError =
      typeof envelope.status_code === "number"
        ? new ApiError(envelope.message, envelope.status_code, envelope)
        : new Error(envelope.message);
    if (!(nextError instanceof ApiError)) {
      nextError.name = "ConversationRunError";
    }
    setError(nextError);
    appendConversationEvents({ appendEvents, setEvents }, [
      {
        type: "run_status",
        id: `${envelope.session_id ?? "unknown-session"}:error:${Date.now()}`,
        sessionId: envelope.session_id ?? "unknown-session",
        ...((envelope.turn_id ?? fallbackTurnId)
          ? { turnId: envelope.turn_id ?? fallbackTurnId }
          : {}),
        status: "error",
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus("error");
    return nextError;
  }

  throw new Error("Unknown conversation stream event");
}

function withConversationTurn(events: SessionEvent[], turnId?: string) {
  return turnId
    ? events.map((event) => ({ ...event, turnId }) as SessionEvent)
    : events;
}

function adoptConversationTurn(
  target: {
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
    updateEvents?: (update: (events: SessionEvent[]) => SessionEvent[]) => void;
  },
  previousTurnId: string | undefined,
  turnId: string | undefined,
  onTurnStarted: ((turnId: string) => void) | undefined,
) {
  if (!turnId || turnId === previousTurnId) {
    return;
  }
  if (previousTurnId?.startsWith("pending-turn:")) {
    updateConversationEvents(target, (current) =>
      current.map((event) =>
        event.turnId === previousTurnId
          ? ({ ...event, turnId } as SessionEvent)
          : event,
      ),
    );
  }
  onTurnStarted?.(turnId);
}

function appendConversationEvents(
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

function updateConversationEvents(
  target: {
    setEvents?: Dispatch<SetStateAction<SessionEvent[]>>;
    updateEvents?: (update: (events: SessionEvent[]) => SessionEvent[]) => void;
  },
  update: (events: SessionEvent[]) => SessionEvent[],
) {
  if (target.updateEvents) {
    target.updateEvents(update);
    return;
  }
  target.setEvents?.(update);
}

function reassignPendingSession(
  event: SessionEvent,
  nextSessionId: string,
): SessionEvent {
  if (event.sessionId !== "pending-session") {
    return event;
  }

  return {
    ...event,
    id: event.id.replace("pending-session", nextSessionId),
    sessionId: nextSessionId,
  } as SessionEvent;
}

function withApproval(
  event: Extract<SessionEvent, { type: "permission_request" }>,
  envelope: Extract<ConversationRunEnvelope, { type: "approval_required" }>,
) {
  const approval = envelope.approval;
  return {
    ...event,
    approvalId: envelope.approval_id,
    description: approval?.description ?? event.description,
    options: normalizeApprovalOptions(approval?.options) ?? event.options,
    title: approval?.title ?? event.title,
  } satisfies SessionEvent;
}

function normalizeApprovalOptions(options: ApprovalOption[] | undefined) {
  const normalized: { optionId: string; kind?: string; name: string }[] = [];
  for (const option of options ?? []) {
    if (!option.option_id) {
      continue;
    }

    normalized.push({
      optionId: option.option_id,
      ...(option.decision ? { kind: option.decision } : {}),
      name: option.label ?? option.option_id,
    });
  }

  return normalized && normalized.length > 0 ? normalized : undefined;
}

function withEnvelopeSession(frame: unknown, sessionId: string) {
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
    return frame;
  }

  return {
    ...frame,
    session_id: sessionId,
    sessionId,
  };
}
