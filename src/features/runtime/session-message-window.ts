"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  flattenSessionHistoryPages,
  listSessionHistory,
  type HistoryListData,
} from "@/features/api/resources";
import type { HistoryMessage } from "@/features/api/types";
import {
  isWorkspaceMessageRead,
  readWorkspaceSource,
} from "@/features/api/workspace-search";

type WindowCursor = { beforeSeq?: number; afterSeq?: number };
export class SessionMessageUnavailableError extends Error {}

// A separate cache/window keeps an old search target from masquerading as a
// contiguous extension of the current tail or owning live-turn calibration.
export function useSessionMessageWindow({
  userId,
  sessionId,
  agentId,
  messageId,
  loadedMessages,
  enabled,
}: {
  userId: string;
  sessionId?: string;
  agentId?: string;
  messageId?: string;
  loadedMessages: HistoryMessage[];
  enabled: boolean;
}) {
  const loaded = loadedMessages.some((item) => item.message_id === messageId);
  const focused = Boolean(messageId && !loaded);
  const query = useInfiniteQuery({
    queryKey: ["session-message-window", userId, sessionId, agentId, messageId],
    enabled: enabled && Boolean(sessionId && agentId && messageId) && focused,
    initialPageParam: {} as WindowCursor,
    queryFn: async ({ pageParam, signal }): Promise<HistoryListData> => {
      if (pageParam.beforeSeq || pageParam.afterSeq) {
        return listSessionHistory(userId, sessionId!, 50, pageParam, signal);
      }
      const anchor = await readWorkspaceSource(
        userId,
        { ref: { kind: "message", id: messageId! }, limit: 1 },
        signal,
      );
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (
        !isWorkspaceMessageRead(anchor) ||
        anchor.message_id !== messageId ||
        anchor.session_id !== sessionId ||
        anchor.agent_id !== agentId ||
        !Number.isSafeInteger(anchor.session_seq) ||
        anchor.session_seq <= 0 ||
        anchor.session_seq >= Number.MAX_SAFE_INTEGER
      ) {
        throw new SessionMessageUnavailableError(
          "This message cannot be located in this session.",
        );
      }
      const [before, after] = await Promise.all([
        listSessionHistory(
          userId,
          sessionId!,
          26,
          { beforeSeq: anchor.session_seq + 1 },
          signal,
        ),
        listSessionHistory(
          userId,
          sessionId!,
          25,
          { afterSeq: anchor.session_seq },
          signal,
        ),
      ]);
      const messages = flattenSessionHistoryPages([after, before]);
      if (!messages.some((message) => message.message_id === messageId)) {
        throw new SessionMessageUnavailableError(
          "This message is no longer in the session history.",
        );
      }
      return {
        messages,
        pagination: {
          has_older: before.pagination?.has_older,
          next_before_seq: before.pagination?.next_before_seq,
          has_newer: after.pagination?.has_newer,
          next_after_seq: after.pagination?.next_after_seq,
        },
      };
    },
    getNextPageParam: (page): WindowCursor | undefined =>
      page.pagination?.has_older && (page.pagination.next_before_seq ?? 0) > 0
        ? { beforeSeq: page.pagination.next_before_seq }
        : undefined,
    getPreviousPageParam: (page): WindowCursor | undefined =>
      page.pagination?.has_newer && (page.pagination.next_after_seq ?? 0) > 0
        ? { afterSeq: page.pagination.next_after_seq }
        : undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });
  return {
    ...query,
    focused,
    isValidating:
      query.isFetching &&
      !query.isFetchingNextPage &&
      !query.isFetchingPreviousPage,
    // A failed permission check must not expose a previous successful window.
    messages: useMemo(
      () =>
        query.isError ||
        (query.isFetching &&
          !query.isFetchingNextPage &&
          !query.isFetchingPreviousPage)
          ? []
          : flattenSessionHistoryPages(query.data?.pages),
      [
        query.isError,
        query.isFetching,
        query.isFetchingNextPage,
        query.isFetchingPreviousPage,
        query.data?.pages,
      ],
    ),
  };
}
