"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import { apiFetch, API_USER_SCOPE, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import { queryKeys } from "./query-keys";
import { secretaryRetryRequests } from "./secretary-retry-requests";

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
export type SecretaryRetryReceipt = {
  request_id: string;
  state: "accepted";
  accepted_at: string;
};
export type SecretaryRetryResponse = SecretaryRetryReceipt | SecretarySettings;

type SecretaryRetryRequest = {
  owner: string;
  requestId: string;
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

export async function runSecretaryNow(userId: string, requestId: string) {
  const data = await apiFetch<unknown>(userPath(userId, "/secretary/run"), {
    method: "POST",
    body: JSON.stringify({ request_id: requestId }),
  });
  return decodeSecretaryRetryResponse(data, requestId);
}

function decodeSecretaryRetryResponse(
  value: unknown,
  requestId: string,
): SecretaryRetryResponse {
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (
      data.request_id === requestId &&
      data.state === "accepted" &&
      typeof data.accepted_at === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(data.accepted_at) &&
      Number.isFinite(Date.parse(data.accepted_at))
    ) {
      return {
        request_id: requestId,
        state: "accepted",
        accepted_at: data.accepted_at,
      };
    }
    // Older Managers acknowledged this endpoint with the current settings.
    if (
      typeof data.enabled === "boolean" &&
      Number.isInteger(data.revision) &&
      Number(data.revision) >= 0 &&
      Number.isInteger(data.pending_count) &&
      Number(data.pending_count) >= 0 &&
      typeof data.agent_available === "boolean" &&
      typeof data.state === "string" &&
      [
        "disabled",
        "idle",
        "waiting",
        "waiting_for_agent",
        "processing",
        "error",
      ].includes(data.state)
    ) {
      return data as SecretarySettings;
    }
  }
  throw new ApiError("Unexpected Secretary retry response.", 502, null);
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
      void client.invalidateQueries({ queryKey: ["secretary-tasks", userId] });
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

// The namespace is the authenticated User.user_id, not the route scope "self".
export function useRunSecretaryNow(ownerUserId: string) {
  const client = useQueryClient();
  const pendingRequest = useStore(
    secretaryRetryRequests,
    (state) => state.pending[ownerUserId],
  );
  const mutation = useMutation({
    mutationKey: ["secretary", ownerUserId, "retry"],
    mutationFn: ({ requestId }: SecretaryRetryRequest) =>
      runSecretaryNow(API_USER_SCOPE, requestId),
    retry: false,
    onMutate: ({ owner }) =>
      client.cancelQueries({
        queryKey: secretaryKeys.settings(owner),
        exact: true,
      }),
    onSuccess: (data, { owner, requestId }) => {
      secretaryRetryRequests.getState().acknowledge(owner, requestId);
      if (data.state !== "accepted")
        client.setQueryData(secretaryKeys.settings(owner), data);
      void client
        .invalidateQueries({
          queryKey: secretaryKeys.settings(owner),
          exact: true,
        })
        .catch(() => {});
      void client
        .invalidateQueries({ queryKey: ["secretary-tasks", owner] })
        .catch(() => {});
    },
    onError: (_error, { owner }) => {
      void client
        .invalidateQueries({
          queryKey: secretaryKeys.settings(owner),
          exact: true,
        })
        .catch(() => {});
      void client
        .invalidateQueries({ queryKey: ["secretary-tasks", owner] })
        .catch(() => {});
    },
  });
  const request = () => ({
    owner: ownerUserId,
    requestId: secretaryRetryRequests.getState().acquire(ownerUserId),
  });
  return {
    ...mutation,
    hasUnconfirmedRequest: Boolean(pendingRequest),
    mutate: () => mutation.mutate(request()),
    mutateAsync: () => mutation.mutateAsync(request()),
  };
}
