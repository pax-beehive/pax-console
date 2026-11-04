"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import { queryKeys } from "./query-keys";

export type SecretaryState =
  | "disabled"
  | "idle"
  | "waiting"
  | "waiting_for_agent"
  | "processing"
  | "error";
export type SecretaryExecutionState =
  | "running"
  | "output_received"
  | "needs_recovery"
  | "unknown"
  | "blocked"
  | "queued"
  | "waiting";
export type SecretaryBlockedReason =
  | "execution_unknown"
  | "lease_expired"
  | "invalid_output"
  | "execution_failed"
  | "canceled"
  | "retry_required"
  | "connection_backoff"
  | "connection_retries_exhausted"
  | "retry_exhausted"
  | "execution_canceled";
export type SecretarySettings = {
  agent_id?: string;
  enabled: boolean;
  revision: number;
  state: SecretaryState;
  pending_count: number;
  last_completed_at?: string;
  last_error?: string;
  agent_available: boolean;
  execution_state?: SecretaryExecutionState;
  blocked_reason?: SecretaryBlockedReason;
};
export type UpdateSecretarySettings = {
  agent_id: string;
  enabled: boolean;
  expected_revision: number;
};

export const secretaryKeys = {
  settings: (userId: string) => ["secretary", userId, "settings"] as const,
};

export function getSecretarySettings(userId: string, signal?: AbortSignal) {
  return apiFetch<SecretarySettings>(userPath(userId, "/secretary"), {
    signal,
  });
}

export function updateSecretarySettings(
  userId: string,
  input: UpdateSecretarySettings,
) {
  return apiFetch<SecretarySettings>(userPath(userId, "/secretary"), {
    method: "PATCH",
    body: JSON.stringify({
      agent_id: input.agent_id,
      enabled: input.enabled,
      expected_revision: input.expected_revision,
    }),
  });
}

export function runSecretaryNow(userId: string) {
  return apiFetch<SecretarySettings>(userPath(userId, "/secretary/run"), {
    method: "POST",
  });
}

export function useSecretarySettings(userId: string | undefined) {
  return useQuery({
    queryKey: secretaryKeys.settings(userId ?? "pending"),
    queryFn: ({ signal }) => getSecretarySettings(userId as string, signal),
    enabled: Boolean(userId),
    retry: (count, error) =>
      !(
        error instanceof AuthError ||
        (error instanceof ApiError && error.status < 500)
      ) && count < 2,
    refetchInterval: (query) => (query.state.data?.enabled ? 5000 : 15000),
  });
}

export function useUpdateSecretarySettings(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSecretarySettings) =>
      updateSecretarySettings(userId, input),
    retry: false,
    onMutate: () =>
      client.cancelQueries({
        queryKey: secretaryKeys.settings(userId),
        exact: true,
      }),
    onSuccess: (data) => {
      client.setQueryData(secretaryKeys.settings(userId), data);
    },
    onError: () => {
      // A lost response may follow a committed write; reload persisted state.
      void client.invalidateQueries({
        queryKey: secretaryKeys.settings(userId),
        exact: true,
      });
      void client.invalidateQueries({
        queryKey: queryKeys.userAgents(userId, "owned"),
        exact: true,
      });
    },
  });
}

export function useRunSecretaryNow(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => runSecretaryNow(userId),
    retry: false,
    onMutate: () =>
      client.cancelQueries({
        queryKey: secretaryKeys.settings(userId),
        exact: true,
      }),
    onSuccess: (data) => {
      client.setQueryData(secretaryKeys.settings(userId), data);
    },
    onError: () => {
      void client.invalidateQueries({
        queryKey: secretaryKeys.settings(userId),
        exact: true,
      });
    },
  });
}
