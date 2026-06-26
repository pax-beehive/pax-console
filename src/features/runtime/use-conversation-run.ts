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

export type ConversationRunStatus = "idle" | "streaming" | "done" | "error";

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
              setEvents,
              setStatus,
              streamId,
            }),
          sessionId: promptSessionId,
          signal: abortController.signal,
          userId,
        });

        setStatus("done");
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
    sendMessage,
    status: agentId && nodeId ? status : "idle",
  };
}

function handleConversationEnvelope(
  envelope: ConversationRunEnvelope,
  {
    onSession,
    setEvents,
    setStatus,
    streamId,
  }: {
    onSession: (sessionId: string) => void;
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
    const events = normalizeTunnelFrame(withEnvelopeSession(envelope), {
      streamId,
    });
    if (events.length > 0) {
      setEvents((current) => [...current, ...events]);
    }
    return;
  }

  if (envelope.type === "done") {
    setStatus("done");
    return;
  }

  throw new Error(envelope.message);
}

function withEnvelopeSession(
  envelope: Extract<ConversationRunEnvelope, { type: "acp" }>,
) {
  if (
    typeof envelope.frame !== "object" ||
    envelope.frame === null ||
    Array.isArray(envelope.frame)
  ) {
    return envelope.frame;
  }

  return {
    ...envelope.frame,
    session_id: envelope.session_id,
    sessionId: envelope.session_id,
  };
}
