"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { AuthError } from "@/features/api/errors";
import { startFocusedPolling } from "./focused-polling";

export function useFocusedQuery<T>(
  key: string,
  userId: string,
  load: (signal: AbortSignal) => Promise<T>,
  interval = 15_000,
) {
  const client = useQueryClient();
  const [focused, setFocused] = useState(false);
  const nextAt = useRef(0);
  const queryKey: QueryKey = ["focused", key, userId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    enabled: false,
    retry: false,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: interval,
  });
  useEffect(() => {
    const queryKey: QueryKey = ["focused", key, userId];
    const state = client.getQueryState(queryKey);
    return startFocusedPolling({
      interval,
      nextAt: Math.max(
        nextAt.current,
        Math.max(state?.dataUpdatedAt ?? 0, state?.errorUpdatedAt ?? 0) +
          interval,
      ),
      onAttempt: (value) => {
        nextAt.current = value;
      },
      onActive: setFocused,
      shouldRetry: (error) => !(error instanceof AuthError),
      cancel: () => {
        void client.cancelQueries({ queryKey, exact: true });
      },
      run: () =>
        client.fetchQuery({
          queryKey,
          queryFn: ({ signal }) => load(signal),
          staleTime: interval,
          retry: false,
        }),
    });
  }, [client, key, userId, load, interval]);
  return { ...query, focused };
}
