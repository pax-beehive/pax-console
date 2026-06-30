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
import type { ApprovalOption } from "../api/types";

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
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (sessionId) {
      sessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  const sendMessage = useCallback(
    async (input: string) => {
      if (!agentId || !nodeId) {
        throw new Error("Select a node and agent before sending a prompt");
      }

      const content = input.trim();
      if (!content) {
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
      setEvents((current) => [
        ...current,
        {
          type: "user_message",
          id: `${optimisticSessionId}:user:${Date.now()}`,
          sessionId: optimisticSessionId,
          content,
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        await streamConversationRun({
          agentId,
          input: content,
          nodeId,
          onEnvelope: (envelope) =>
            handleConversationEnvelope(envelope, {
              onSession: (nextSessionId) => {
                sessionIdRef.current = nextSessionId;
                onSession?.(nextSessionId);
              },
              setError,
              setEvents,
              setStatus,
              streamId,
            }),
          sessionId: promptSessionId,
          signal: abortController.signal,
          userId,
        });

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
    [agentId, nodeId, onSession, userId],
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
              setEvents,
              setStatus,
              streamId,
            }),
          resume: { approvalId },
          sessionId: currentSessionId,
          signal: abortController.signal,
          userId,
        });

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
    [agentId, nodeId, onSession, userId],
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
    setEvents,
    setStatus,
    streamId,
  }: {
    onSession: (sessionId: string) => void;
    setError: Dispatch<SetStateAction<Error | null>>;
    setEvents: Dispatch<SetStateAction<SessionEvent[]>>;
    setStatus: Dispatch<SetStateAction<ConversationRunStatus>>;
    streamId: string;
  },
) {
  if (envelope.type === "session") {
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
      setEvents((current) => [...current, ...events]);
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
      setEvents((current) => [...current, ...events]);
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
    setEvents((current) => [
      ...current,
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
