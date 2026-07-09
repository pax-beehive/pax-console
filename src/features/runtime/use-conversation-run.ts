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
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

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
          approvalMode: promptSessionId ? undefined : options?.approvalMode,
          cwd: promptSessionId ? undefined : options?.cwd,
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
    setEvents((current) =>
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
      setEvents((current) => appendUniqueEvents(current, events));
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
      setEvents((current) => appendUniqueEvents(current, events));
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
    setEvents((current) =>
      appendUniqueEvents(current, [
        {
          type: "run_status",
          id: `${envelope.session_id}:done`,
          sessionId: envelope.session_id,
          status: "done",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
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
    setEvents((current) =>
      appendUniqueEvents(current, [
        {
          type: "run_status",
          id: `${envelope.session_id ?? "unknown-session"}:error:${Date.now()}`,
          sessionId: envelope.session_id ?? "unknown-session",
          status: "error",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
    setStatus("error");
    return;
  }

  throw new Error("Unknown conversation stream event");
}

function appendUniqueEvents(current: SessionEvent[], incoming: SessionEvent[]) {
  const seen = new Set(current.map(eventSignature));
  const next = [...current];
  for (const event of incoming) {
    if (isAppendOnlyChunk(event)) {
      next.push(event);
      continue;
    }

    const permissionIndex = findPermissionRequestIndex(next, event);
    if (permissionIndex !== -1 && event.type === "permission_request") {
      next[permissionIndex] = mergePermissionRequest(
        next[permissionIndex] as Extract<
          SessionEvent,
          { type: "permission_request" }
        >,
        event,
      );
      seen.add(eventSignature(next[permissionIndex]));
      continue;
    }

    const signature = eventSignature(event);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    next.push(event);
  }

  return next;
}

function findPermissionRequestIndex(
  eventList: SessionEvent[],
  incoming: SessionEvent,
) {
  if (incoming.type !== "permission_request") {
    return -1;
  }

  return eventList.findIndex(
    (event) =>
      event.type === "permission_request" &&
      event.sessionId === incoming.sessionId &&
      event.requestId === incoming.requestId,
  );
}

function mergePermissionRequest(
  current: Extract<SessionEvent, { type: "permission_request" }>,
  incoming: Extract<SessionEvent, { type: "permission_request" }>,
) {
  return {
    ...current,
    ...incoming,
    approvalId: incoming.approvalId ?? current.approvalId,
    decision: incoming.decision ?? current.decision,
    decidedAt: incoming.decidedAt ?? current.decidedAt,
  } satisfies SessionEvent;
}

function isAppendOnlyChunk(event: SessionEvent) {
  return (
    ((event.type === "agent_message" || event.type === "progress") &&
      event.streaming === true &&
      (event.sessionUpdate === "agent_message_chunk" ||
        event.sessionUpdate === "agent_thought_chunk" ||
        event.sessionUpdate === undefined)) ||
    (event.type === "tool_call" &&
      event.sessionUpdate === "tool_call_content_chunk")
  );
}

function eventSignature(event: SessionEvent) {
  if (
    event.type === "agent_message" ||
    event.type === "progress" ||
    event.type === "user_message" ||
    event.type === "invocation"
  ) {
    return `${event.type}:${event.id}:${event.sessionId}:${event.content}`;
  }

  if (event.type === "tool_call") {
    const payload = JSON.stringify(event.output ?? event.input ?? "");
    return `${event.type}:${event.id}:${event.toolCallId ?? ""}:${event.status}:${payload}`;
  }

  if (event.type === "permission_request") {
    return `${event.type}:${event.sessionId}:${event.requestId}:${event.approvalId ?? ""}`;
  }

  return `${event.type}:${event.id}`;
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
