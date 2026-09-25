"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../api/query-keys";
import type { AgentSession, HistoryMessage } from "../api/types";
import {
  emptyHistorySync,
  HistorySyncState,
  mergeSyncedHistory,
  syncSessionHistory,
} from "./session-history-sync";
import { usePageResume } from "./use-page-resume";

export function useSessionHistorySync({
  userId,
  sessionId,
  session,
  history,
  metadataVersion,
}: {
  userId: string;
  sessionId?: string;
  session?: AgentSession | null;
  history: HistoryMessage[];
  metadataVersion: number;
}) {
  const client = useQueryClient();
  const key = useMemo(
    () => queryKeys.sessionHistorySync(userId, sessionId ?? "pending"),
    [userId, sessionId],
  );
  const pendingRef = useRef({
    sessionId,
    turns: new Set<string>(),
    tail: true,
  });
  const getPending = useCallback(() => {
    if (pendingRef.current.sessionId !== sessionId) {
      pendingRef.current = { sessionId, turns: new Set<string>(), tail: true };
    }
    return pendingRef.current;
  }, [sessionId]);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const pending = getPending();
      const turnIds = [...pending.turns];
      const refreshTail = pending.tail;
      pending.tail = false;
      try {
        const next = await syncSessionHistory({
          userId,
          sessionId: sessionId!,
          session: session ?? undefined,
          history,
          current: client.getQueryData<HistorySyncState>(key),
          turnIds,
          refreshTail,
        });
        for (const id of next.calibratedTurnIds) pending.turns.delete(id);
        return next;
      } catch (error) {
        pending.tail ||= refreshTail;
        throw error;
      }
    },
  });
  const { refetch } = query;
  const refreshQueueRef = useRef<{
    key: typeof key;
    running: boolean;
    requested: boolean;
    active: boolean;
  } | null>(null);
  useEffect(() => {
    const queue = { key, running: false, requested: false, active: true };
    refreshQueueRef.current = queue;
    return () => {
      queue.active = false;
    };
  }, [key]);
  const refresh = useCallback(() => {
    const refreshQueue = refreshQueueRef.current;
    if (!sessionId || !refreshQueue || refreshQueue.key !== key) return;
    refreshQueue.requested = true;
    if (refreshQueue.running) return;
    refreshQueue.running = true;
    void (async () => {
      try {
        // A metadata/focus update during a read must run again with the latest
        // query options after that read commits, rather than being deduplicated.
        while (refreshQueue.active && refreshQueue.requested) {
          refreshQueue.requested = false;
          await refetch({ cancelRefetch: false });
        }
      } finally {
        refreshQueue.running = false;
      }
    })();
  }, [refetch, key, sessionId]);
  useEffect(() => {
    refresh();
  }, [metadataVersion, refresh]);
  usePageResume(
    () => {
      getPending().tail = true;
      refresh();
    },
    { includeWindowFocus: true },
  );
  const calibrate = useCallback(
    (turnId?: string) => {
      const pending = getPending();
      if (turnId) pending.turns.add(turnId);
      pending.tail = true;
      refresh();
    },
    [getPending, refresh],
  );
  const sync = query.data ?? emptyHistorySync;
  return {
    messages: useMemo(() => mergeSyncedHistory(history, sync), [history, sync]),
    calibratedTurnIds: sync.calibratedTurnIds,
    snapshotTurnIds: sync.snapshotTurnIds,
    calibrate,
    error: query.error,
  };
}
