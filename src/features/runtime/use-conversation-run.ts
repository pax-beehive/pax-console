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
import { SessionEvent } from "./session-events";
import {
  appendSessionEvents,
  useBufferedSessionEvents,
} from "./use-buffered-session-events";
import type { ApprovalOption, SessionApprovalMode } from "../api/types";

export type ConversationRunStatus =
  | "idle"
  | "streaming"
  | "waiting_approval"
  | "done"
  | "error";

type UseConversationRunOptions = {
  agentId?: string;
  nodeId?: string;
  onSession?: (sessionId: string) => void;
  sessionId?: string;
  userId: string;
};

type SendMessageOptions = {
  approvalMode?: SessionApprovalMode;
  attachmentIds?: string[];
  cwd?: string;
};

export function useConversationRun({
  agentId,
  nodeId,
  onSession,
  sessionId,
  userId,
}: UseConversationRunOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  const [status, setStatus] = useState<ConversationRunStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
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
      const streamId = `${optimisticSessionId}:turn:${Date.now()}`;

      setError(null);
      setStatus("streaming");
      if (content) {
        appendEvents([
          {
            type: "user_message",
            id: `${optimisticSessionId}:user:${Date.now()}`,
            sessionId: optimisticSessionId,
            content,
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
          onEnvelope: (envelope) =>
            handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              appendEvents,
              setStatus,
              streamId,
              updateEvents,
            }),
          sessionId: promptSessionId,
          signal: abortController.signal,
          userId,
        });

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
      setStatus("streaming");

      try {
        await streamConversationRun({
          agentId,
          nodeId,
          onEnvelope: (envelope) =>
            handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              appendEvents,
              setStatus,
              streamId,
              updateEvents,
            }),
          resume: { approvalId },
          sessionId: currentSessionId,
          signal: abortController.signal,
          userId,
        });

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

  return {
    error,
    events,
    resumePermission,
    sendMessage,
    status: agentId && nodeId ? status : "idle",
  };
}

export function handleConversationEnvelope(
  envelope: ConversationRunEnvelope,
  {
    onSession,
    setError,
    appendEvents,
    setEvents,
    setStatus,
    streamId,
    updateEvents,
  }: {
    onSession: (sessionId: string) => void;
    setError: Dispatch<SetStateAction<Error | null>>;
    appendEvents?: (events: SessionEvent[]) => void;
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

  if (envelope.type === "acp") {
    const events = normalizeTunnelFrame(
      withEnvelopeSession(envelope.frame, envelope.session_id),
      {
        streamId,
      },
    );
    if (events.length > 0) {
      appendConversationEvents({ appendEvents, setEvents }, events);
    }
    return;
  }

  if (envelope.type === "approval_required") {
    const events = normalizeTunnelFrame(
      withEnvelopeSession(envelope.frame, envelope.session_id),
      {
        streamId,
      },
    ).map((event) =>
      event.type === "permission_request"
        ? withApproval(event, envelope)
        : event,
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

  if (envelope.type === "done") {
    appendConversationEvents({ appendEvents, setEvents }, [
      {
        type: "turn_done",
        id: `${envelope.session_id}:done`,
        sessionId: envelope.session_id,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus((current) => (current === "error" ? current : "done"));
    return;
  }

  if (envelope.type === "error") {
    if (envelope.session_id) {
      onSession(envelope.session_id);
    }
    const nextError = new Error(envelope.message);
    nextError.name = "ConversationRunError";
    setError(nextError);
    appendConversationEvents({ appendEvents, setEvents }, [
      {
        type: "run_status",
        id: `${envelope.session_id ?? "unknown-session"}:error:${Date.now()}`,
        sessionId: envelope.session_id ?? "unknown-session",
        status: "error",
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatus("error");
    return;
  }

  throw new Error("Unknown conversation stream event");
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
