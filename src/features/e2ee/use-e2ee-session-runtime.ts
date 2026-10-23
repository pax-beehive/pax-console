"use client";

import {
  uploadEncryptedAttachment,
  type PendingEncryptedAttachment,
} from "./attachments";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryKeys } from "@/features/api/query-keys";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import {
  loadEncryptedTurn,
  normalizeReplayFrame,
  replayHistoryEvents,
} from "./replay";
import type { SessionEvent } from "@/features/runtime/session-events";

import { loadRootKey } from "./root-key-store";
import {
  buildE2EECancelFrame,
  buildE2EEPromptFrame,
  buildE2EESessionNewFrame,
  parseE2EERPCResponse,
} from "./session-lab";
import { observeEncryptedEvents, sendEncryptedCommand } from "./transport";

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
  onAttachmentFailure?: (attachments: PendingEncryptedAttachment[]) => void;
};

export function useE2EESessionRuntime({
  agentId,
  enabled,
  keyEpoch = 1,
  sessionId,
  userId,
  onAttachmentFailure,
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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const sentAttachments = useRef(
    new Map<string, PendingEncryptedAttachment[]>(),
  );
  const [failedAttachments, setFailedAttachments] = useState<{
    sessionId?: string;
    files: PendingEncryptedAttachment[];
  }>({ files: [] });
  useEffect(
    () => () => uploadController.current?.abort(),
    [agentId, sessionId],
  );
  const postingRequests = useRef(new Set<string>());
  const postingErrors = useRef(new Map<string, Error>());
  const cursorRef = useRef(0);
  const pendingTurnIdRef = useRef<string | undefined>(undefined);
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
    pendingTurnIdRef.current = undefined;
    pendingRequestIdsRef.current.clear();
    sentAttachments.current.clear();
    pendingLifecycleRequestsRef.current.clear();
  }, [sessionId]);

  const queryClient = useQueryClient();
  const replayQueryKey = useMemo(
    () => [
      ...queryKeys.encryptedSessionHistory(
        userId,
        agentId ?? "pending",
        sessionId ?? "pending",
        keyEpoch,
      ),
      "turn-replay",
    ],
    [userId, agentId, sessionId, keyEpoch],
  );
  const historyQuery = useInfiniteQuery({
    queryKey: replayQueryKey,
    queryFn: ({ pageParam, signal }) =>
      loadEncryptedTurn({
        signal,
        agentId: agentId as string,
        beforeId: pageParam,
        keyEpoch,
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
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const replayHead = historyQuery.data?.pages[0]?.headCursor;
  const refetchReplay = historyQuery.refetch;
  const waitForReplay = useCallback(async () => {
    if (queryClient.getQueryData(replayQueryKey)) return;
    // Join the initial read before posting commands. Otherwise their responses
    // could enter the replay snapshot and be skipped by the live RPC observer.
    const result = await refetchReplay({
      cancelRefetch: false,
      throwOnError: true,
    });
    if (!result.data) throw new Error("Encrypted replay did not complete");
  }, [queryClient, replayQueryKey, refetchReplay]);
  const historyEvents = useMemo(
    () => replayHistoryEvents(historyQuery.data?.pages),
    [historyQuery.data?.pages],
  );

  useEffect(() => {
    if (
      !enabled ||
      !agentId ||
      !sessionId ||
      !rootKey ||
      replayHead === undefined
    ) {
      return;
    }
    cursorRef.current = Math.max(cursorRef.current, replayHead);
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
      onFrame(frame, context) {
        const receivedAt = new Date().toISOString();
        const normalized = normalizeReplayFrame(
          frame,
          sessionId,
          context,
          receivedAt,
        );
        if (normalized.length > 0) {
          const pendingTurnId = pendingTurnIdRef.current;
          setEventState((current) => {
            const remappedCurrentEvents =
              current.sessionId === sessionId
                ? current.events.map((event) =>
                    context.turnId &&
                    pendingTurnId &&
                    event.turnId === pendingTurnId
                      ? ({ ...event, turnId: context.turnId } as SessionEvent)
                      : event,
                  )
                : [];

            return {
              events: mergeEvents([...remappedCurrentEvents, ...normalized]),
              sessionId,
            };
          });
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
          pendingTurnIdRef.current = undefined;
          if (response.error) {
            if (postingRequests.current.has(response.requestId))
              postingErrors.current.set(
                response.requestId,
                new Error(response.error),
              );
            const files = sentAttachments.current.get(response.requestId) ?? [];
            setFailedAttachments({ sessionId, files });
            if (files.length) onAttachmentFailure?.(files);
            setError(new Error(response.error));
            setStatus("error");
          } else {
            setStatus("done");
          }
          sentAttachments.current.delete(response.requestId);
        }
      },
    }).catch((caught) => {
      if (!controller.signal.aborted) {
        setError(asError(caught));
        setStatus("error");
      }
    });
    return () => controller.abort();
  }, [
    agentId,
    enabled,
    keyEpoch,
    replayHead,
    rootKey,
    sessionId,
    userId,
    onAttachmentFailure,
  ]);

  const sendMessage = useCallback(
    async (content: string, attachments: PendingEncryptedAttachment[] = []) => {
      const normalized = content.trim();
      if (attachments.length > 16)
        throw new Error("Attach at most 16 files per message");
      if (!enabled || !agentId || !sessionId || !rootKey) {
        throw new Error(
          rootKey
            ? "Encrypted session route is incomplete"
            : "This browser does not have the root key for this encrypted session",
        );
      }
      if (!normalized && attachments.length === 0) {
        throw new Error("Prompt cannot be empty");
      }

      if (attachments.some((attachment) => !attachment.encryptedFile)) {
        throw new Error(
          "Remove previously uploaded plaintext attachments and add them again in encrypted mode",
        );
      }
      await waitForReplay();
      if (uploadController.current)
        throw new Error("An attachment upload is already in progress");
      const controller = new AbortController();
      uploadController.current = controller;
      const encryptedAttachments = [];
      try {
        for (const attachment of attachments) {
          encryptedAttachments.push(
            await uploadEncryptedAttachment(
              attachment.encryptedFile!,
              rootKey,
              {
                agent_id: agentId,
                session_id: sessionId,
                key_epoch: keyEpoch,
              },
              userId,
              controller.signal,
              (phase, percent) =>
                setUploadProgress(
                  `${phase} ${attachment.filename}: ${percent}%`,
                ),
            ),
          );
        }
        controller.signal.throwIfAborted();
      } finally {
        uploadController.current = null;
        setUploadProgress(null);
      }
      const requestId = `e2ee_prompt_${crypto.randomUUID()}`;
      if (attachments.length)
        sentAttachments.current.set(requestId, attachments);
      const pendingTurnId = `pending-turn:${requestId}`;
      pendingRequestIdsRef.current.add(requestId);
      pendingTurnIdRef.current = pendingTurnId;
      setError(null);
      setStatus("streaming");
      setEventState((current) => ({
        events: [
          ...(current.sessionId === sessionId ? current.events : []),
          {
            type: "user_message",
            id: `${sessionId}:user:${requestId}`,
            sessionId,
            turnId: pendingTurnId,
            content: normalized,
            attachments: attachments.map(
              ({ filename, contentType, sizeBytes }) => ({
                filename,
                contentType,
                sizeBytes,
              }),
            ),
            createdAt: new Date().toISOString(),
          },
        ],
        sessionId,
      }));
      try {
        postingRequests.current.add(requestId);
        const posted = await sendEncryptedCommand({
          agentId,
          frame: buildE2EEPromptFrame(
            requestId,
            sessionId,
            normalized,
            encryptedAttachments,
          ),
          keyEpoch,
          rootKey,
          sessionId,
          userId,
        });
        const rejected = postingErrors.current.get(requestId);
        if (rejected) throw rejected;
        return posted;
      } catch (caught) {
        pendingRequestIdsRef.current.delete(requestId);
        sentAttachments.current.delete(requestId);
        pendingTurnIdRef.current = undefined;
        const nextError = asError(caught);
        setError(nextError);
        setStatus("error");
        throw nextError;
      } finally {
        postingRequests.current.delete(requestId);
        postingErrors.current.delete(requestId);
      }
    },
    [agentId, enabled, keyEpoch, rootKey, sessionId, userId, waitForReplay],
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
      await waitForReplay();
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
    [agentId, enabled, keyEpoch, rootKey, sessionId, userId, waitForReplay],
  );

  const stop = useCallback(async () => {
    if (!enabled || !agentId || !sessionId || !rootKey) {
      throw new Error("Encrypted session route is incomplete");
    }
    setError(null);
    try {
      await waitForReplay();
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
  }, [agentId, enabled, keyEpoch, rootKey, sessionId, userId, waitForReplay]);

  return {
    uploadProgress,
    cancelUpload: () => uploadController.current?.abort(),
    failedAttachments:
      failedAttachments.sessionId === sessionId ? failedAttachments.files : [],
    error,
    events,
    historyQuery,
    historyEvents,
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
