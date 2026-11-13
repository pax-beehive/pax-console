"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import type { WorkspaceSummaryVersion } from "./workspace-search";

export type SecretaryGuidance = {
  scope: "user" | "session";
  source_id?: string;
  revision: number;
  instruction: string;
  updated_at?: string;
};
export type SecretaryOperationKind =
  | "guided_summary"
  | "human_summary"
  | "human_edit";
export type PrepareSecretaryOperation = {
  source_id: string;
  kind: SecretaryOperationKind;
  scope: "pending" | "all" | "selected";
  message_ids?: string[];
  summary_id?: string;
};
export type SecretaryOperation = {
  operation_id: string;
  source_id: string;
  kind: SecretaryOperationKind;
  status:
    | "draft"
    | "queued"
    | "running"
    | "completed"
    | "needs_attention"
    | "superseded";
  revision: number;
  targets: {
    message_id: string;
    content_hash: string;
    canonicalization_version: string;
    change_revision: number;
    role: string;
    preview: string;
  }[];
  instructions: {
    user?: SecretaryGuidance;
    session?: SecretaryGuidance;
    run?: string;
  };
  baseline_refs: { summary_id: string; revision: number }[];
  summary?: WorkspaceSummaryVersion;
  result_refs: { summary_id: string; revision: number }[];
  error?: string;
};
export type SubmitSecretaryOperation = {
  request_id: string;
  expected_revision: number;
  message_ids?: string[];
  coverage_message_ids?: string[];
  run_instruction?: string;
  title?: string;
  body?: string;
  summary_id?: string;
  expected_summary_revision?: number;
  confirm_replace?: boolean;
};

export function secretaryInstructionError(instruction: string) {
  if (instruction.includes("\0"))
    return "Requirements cannot contain a null character.";
  if (
    Array.from(instruction).length > 4096 ||
    new TextEncoder().encode(instruction).length > 8192
  )
    return "Requirements must fit within 4,096 characters and 8,192 UTF-8 bytes.";
  return undefined;
}

const guidancePath = (scope: "user" | "session", sourceId?: string) => {
  const query = new URLSearchParams({ scope });
  if (sourceId) query.set("source_id", sourceId);
  return `/secretary/guidance?${query}`;
};
export function getSecretaryGuidance(
  userId: string,
  scope: "user" | "session",
  sourceId?: string,
  signal?: AbortSignal,
) {
  return apiFetch<SecretaryGuidance>(
    userPath(userId, guidancePath(scope, sourceId)),
    { signal },
  );
}
export function saveSecretaryGuidance(
  userId: string,
  scope: "user" | "session",
  sourceId: string | undefined,
  instruction: string,
  expectedRevision: number,
) {
  return apiFetch<SecretaryGuidance>(
    userPath(userId, guidancePath(scope, sourceId)),
    {
      method: "PUT",
      body: JSON.stringify({
        instruction,
        expected_revision: expectedRevision,
      }),
    },
  );
}
export function prepareSecretaryOperation(
  userId: string,
  input: PrepareSecretaryOperation,
) {
  return apiFetch<SecretaryOperation>(
    userPath(userId, "/secretary/operations/prepare"),
    {
      method: "POST",
      body: JSON.stringify({
        source_id: input.source_id,
        kind: input.kind,
        scope: input.scope,
        ...(input.message_ids ? { message_ids: input.message_ids } : {}),
        ...(input.summary_id ? { summary_id: input.summary_id } : {}),
      }),
    },
  );
}
export function getSecretaryOperation(
  userId: string,
  operationId: string,
  signal?: AbortSignal,
) {
  return apiFetch<SecretaryOperation>(
    userPath(
      userId,
      `/secretary/operations/${encodeURIComponent(operationId)}`,
    ),
    { signal },
  );
}
export function submitSecretaryOperation(
  userId: string,
  operationId: string,
  input: SubmitSecretaryOperation,
) {
  const {
    request_id,
    expected_revision,
    message_ids,
    coverage_message_ids,
    run_instruction,
    title,
    body,
    summary_id,
    expected_summary_revision,
    confirm_replace,
  } = input;
  return apiFetch<SecretaryOperation>(
    userPath(
      userId,
      `/secretary/operations/${encodeURIComponent(operationId)}/submit`,
    ),
    {
      method: "POST",
      body: JSON.stringify({
        request_id,
        expected_revision,
        message_ids,
        coverage_message_ids,
        run_instruction,
        title,
        body,
        summary_id,
        expected_summary_revision,
        confirm_replace,
      }),
    },
  );
}
export const secretaryControlKeys = {
  guidance: (userId: string, scope: "user" | "session", sourceId?: string) =>
    ["secretary-guidance", userId, scope, sourceId ?? null] as const,
  operation: (userId: string, operationId?: string) =>
    ["secretary-operations", userId, operationId ?? null] as const,
};
function retryRead(count: number, error: Error) {
  return (
    !(
      error instanceof AuthError ||
      (error instanceof ApiError && error.status < 500) ||
      error.name === "AbortError" ||
      error.name === "TimeoutError"
    ) && count < 2
  );
}
export function useSecretaryGuidance(
  userId: string,
  scope: "user" | "session",
  sourceId?: string,
) {
  return useQuery({
    queryKey: secretaryControlKeys.guidance(userId, scope, sourceId),
    queryFn: ({ signal }) =>
      getSecretaryGuidance(userId, scope, sourceId, signal),
    refetchOnMount: "always",
    retry: retryRead,
  });
}
export function useSaveSecretaryGuidance(
  userId: string,
  scope: "user" | "session",
  sourceId?: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { instruction: string; expected_revision: number }) =>
      saveSecretaryGuidance(
        userId,
        scope,
        sourceId,
        input.instruction,
        input.expected_revision,
      ),
    retry: false,
    onSuccess: (data) =>
      client.setQueryData(
        secretaryControlKeys.guidance(userId, scope, sourceId),
        data,
      ),
    onError: () => {
      void client.invalidateQueries({
        queryKey: secretaryControlKeys.guidance(userId, scope, sourceId),
      });
    },
  });
}
export function usePrepareSecretaryOperation(userId: string) {
  return useMutation({
    mutationFn: (input: PrepareSecretaryOperation) =>
      prepareSecretaryOperation(userId, input),
    retry: false,
  });
}
export function useSecretaryOperation(userId: string, operationId?: string) {
  return useQuery({
    queryKey: secretaryControlKeys.operation(userId, operationId),
    queryFn: ({ signal }) =>
      getSecretaryOperation(userId, operationId!, signal),
    enabled: Boolean(operationId),
    refetchOnMount: "always",
    retry: retryRead,
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "")
        ? 3000
        : false,
  });
}
export function useSubmitSecretaryOperation(
  userId: string,
  operationId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitSecretaryOperation) =>
      submitSecretaryOperation(userId, operationId, input),
    retry: false,
    onSuccess: (data) =>
      client.setQueryData(
        secretaryControlKeys.operation(userId, operationId),
        data,
      ),
    onSettled: () =>
      Promise.all(
        [
          ["secretary-operations", userId],
          ["secretary-tasks", userId],
          ["secretary-summaries", userId],
          ["secretary", userId],
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      ).then(() => undefined),
  });
}
