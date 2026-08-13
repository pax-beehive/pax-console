"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@/features/api/query-keys";
import { normalizeTunnelFrame } from "@/features/runtime/normalize-tunnel-frame";
import type { SessionEvent } from "@/features/runtime/session-events";
import { loadRootKey } from "./root-key-store";
import {
  buildE2EECancelFrame,
  buildE2EEPromptFrame,
  buildE2EESessionNewFrame,
  parseE2EERPCResponse,
} from "./session-lab";
import {
  loadEncryptedSessionHistory,
  observeEncryptedEvents,
  sendEncryptedCommand,
} from "./transport";

export type E2EESessionRuntimeStatus =
  | "idle"
  | "locked"
  | "streaming"
  | "done"
  | "error";

type UseE2EESessionRuntimeOptions = {
  agentId?: string;
  enabled: boolean;
  keyEpoch?: number;
  sessionId?: string;
  userId: string;
};

export function useE2EESessionRuntime({
  agentId,
  enabled,
  keyEpoch = 1,
  sessionId,
  userId,
}: UseE2EESessionRuntimeOptions) {
  const [rootKeyState, setRootKeyState] = useState<{
    agentId: string;
    key?: Uint8Array;
  }>({ agentId: "" });
  const [error, setError] = useState<Error | null>(null);
  const [eventState, setEventState] = useState<{
    events: SessionEvent[];
    sessionId?: string;
  }>({ events: [], sessionId });
  const events = eventState.sessionId === sessionId ? eventState.events : [];
  const [status, setStatus] = useState<E2EESessionRuntimeStatus>("idle");
  const cursorRef = useRef(0);
  const pendingRequestIdsRef = useRef(new Set<string>());
  const pendingLifecycleRequestsRef = useRef(
    new Map<string, { reject: (error: Error) => void; resolve: () => void }>(),
  );
  const rootKey =
    rootKeyState.agentId === agentId ? rootKeyState.key : undefined;
  const keyLoading = Boolean(
    enabled && agentId && rootKeyState.agentId !== agentId,
  );

  useEffect(() => {
    let active = true;
    if (!enabled || !agentId) {
      return;
    }

    void loadRootKey(agentId)
      .then((key) => {
        if (!active) {
          return;
        }
        setRootKeyState({ agentId, key });
        setError(null);
        setEventState({ events: [] });
        setStatus(key ? "idle" : "locked");
      })
      .catch((caught) => {
        if (!active) {
          return;
        }
        const nextError = asError(caught);
        setRootKeyState({ agentId });
        setError(nextError);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [agentId, enabled]);

  useEffect(() => {
    cursorRef.current = 0;
    pendingRequestIdsRef.current.clear();
    pendingLifecycleRequestsRef.current.clear();
  }, [sessionId]);

  const historyQuery = useInfiniteQuery({
    queryKey: queryKeys.encryptedSessionHistory(
      userId,
      agentId ?? "pending",
      sessionId ?? "pending",
      keyEpoch,
    ),
    queryFn: ({ pageParam }) =>
      loadEncryptedSessionHistory({
        agentId: agentId as string,
        beforeId: pageParam,
        keyEpoch,
        limit: 500,
        rootKey: rootKey as Uint8Array,
        sessionId: sessionId as string,
        userId,
      }),
    enabled: Boolean(enabled && agentId && sessionId && rootKey),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more && lastPage.pagination.next_before_id > 0
        ? lastPage.pagination.next_before_id
        : undefined,
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const refetchHistory = historyQuery.refetch;

  useEffect(() => {
    if (!enabled || !agentId || !sessionId || !rootKey) {
      return;
    }
    const controller = new AbortController();
    void observeEncryptedEvents({
      agentId,
      afterCursor: cursorRef.current,
      keyEpoch,
      rootKey,
      sessionId,
      signal: controller.signal,
      userId,
      onCursor(cursor) {
        cursorRef.current = cursor;
      },
      onFrame(frame) {
        const receivedAt = new Date().toISOString();
        const normalized = normalizeTunnelFrame(frame, {
          createdAt: receivedAt,
          streamId: `e2ee:${sessionId}`,
        });
        if (normalized.length > 0) {
          setEventState((current) => ({
            events: [
              ...(current.sessionId === sessionId ? current.events : []),
              ...normalized,
            ].slice(-500),
            sessionId,
          }));
        }

        const response = parseE2EERPCResponse(frame);
        const lifecycle = response
          ? pendingLifecycleRequestsRef.current.get(response.requestId)
          : undefined;
        if (response && lifecycle) {
          pendingLifecycleRequestsRef.current.delete(response.requestId);
          if (response.error) {
            const responseError = new Error(response.error);
            setError(responseError);
            setStatus("error");
            lifecycle.reject(responseError);
          } else {
            setStatus("done");
            lifecycle.resolve();
          }
          return;
        }
        if (
          response &&
          pendingRequestIdsRef.current.delete(response.requestId)
        ) {
          if (response.error) {
            setError(new Error(response.error));
            setStatus("error");
          } else {
            setStatus("done");
            void refetchHistory();
          }
        }
      },
    }).catch((caught) => {
      if (!controller.signal.aborted) {
        setError(asError(caught));
        setStatus("error");
      }
    });
    return () => controller.abort();
  }, [agentId, enabled, keyEpoch, refetchHistory, rootKey, sessionId, userId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const normalized = content.trim();
      if (!enabled || !agentId || !sessionId || !rootKey) {
        throw new Error(
          rootKey
            ? "Encrypted session route is incomplete"
            : "This browser does not have the root key for this encrypted session",
        );
      }
      if (!normalized) {
        throw new Error("Prompt cannot be empty");
      }

      const requestId = `e2ee_prompt_${crypto.randomUUID()}`;
      pendingRequestIdsRef.current.add(requestId);
      setError(null);
      setStatus("streaming");
      setEventState((current) => ({
        events: [
          ...(current.sessionId === sessionId ? current.events : []),
          {
            type: "user_message",
            id: `${sessionId}:user:${requestId}`,
            sessionId,
            turnId: `pending-turn:${requestId}`,
            content: normalized,
            createdAt: new Date().toISOString(),
          },
        ],
        sessionId,
      }));
      try {
        return await sendEncryptedCommand({
          agentId,
          frame: buildE2EEPromptFrame(requestId, sessionId, normalized),
          keyEpoch,
          rootKey,
          sessionId,
          userId,
        });
      } catch (caught) {
        pendingRequestIdsRef.current.delete(requestId);
        const nextError = asError(caught);
        setError(nextError);
        setStatus("error");
        throw nextError;
      }
    },
    [agentId, enabled, keyEpoch, rootKey, sessionId, userId],
  );

  const startSession = useCallback(
    async (cwd: string) => {
      if (!enabled || !agentId || !sessionId || !rootKey) {
        throw new Error(
          rootKey
            ? "Encrypted session route is incomplete"
            : "This browser does not have the root key for this encrypted session",
        );
      }
      const requestId = `e2ee_new_${crypto.randomUUID()}`;
      const response = new Promise<void>((resolve, reject) => {
        pendingLifecycleRequestsRef.current.set(requestId, { reject, resolve });
      });
      setError(null);
      setStatus("streaming");
      try {
        await sendEncryptedCommand({
          agentId,
          frame: buildE2EESessionNewFrame(requestId, cwd),
          keyEpoch,
          rootKey,
          sessionId,
          userId,
        });
        await response;
      } catch (caught) {
        pendingLifecycleRequestsRef.current.delete(requestId);
        const nextError = asError(caught);
        setError(nextError);
        setStatus("error");
        throw nextError;
      }
    },
    [agentId, enabled, keyEpoch, rootKey, sessionId, userId],
  );

  const stop = useCallback(async () => {
    if (!enabled || !agentId || !sessionId || !rootKey) {
      throw new Error("Encrypted session route is incomplete");
    }
    setError(null);
    try {
      return await sendEncryptedCommand({
        agentId,
        frame: buildE2EECancelFrame(sessionId),
        keyEpoch,
        rootKey,
        sessionId,
        userId,
      });
    } catch (caught) {
      const nextError = asError(caught);
      setError(nextError);
      setStatus("error");
      throw nextError;
    }
  }, [agentId, enabled, keyEpoch, rootKey, sessionId, userId]);

  return {
    error,
    events,
    historyQuery,
    keyLoading,
    rootKeyAvailable: Boolean(rootKey),
    sendMessage,
    startSession,
    status,
    stop,
  };
}

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}
