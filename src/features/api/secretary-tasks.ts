"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";

export type SecretaryTaskState =
  | "queued"
  | "waiting_source"
  | "waiting_retry"
  | "running"
  | "needs_recovery"
  | "output_received"
  | "unknown"
  | "failed"
  | "blocked"
  | "completed";
export type SecretaryTask = {
  task_id: string;
  session_id: string;
  source_agent_id: string;
  title: string;
  secretary_agent_id: string;
  revision: number;
  settings_revision: number;
  retry_epoch: number;
  batch_id: string;
  attempt_id: string;
  execution_state: SecretaryTaskState;
  paused: boolean;
  attempt_count: number;
  connection_failures: number;
  next_retry_at?: string;
  created_at?: string;
  updated_at?: string;
  error_code?: string;
  error_message?: string;
  execution_session_id?: string;
  execution_agent_id?: string;
  execution_status?: string;
  lease_active: boolean;
};
export type SecretaryTaskAttempt = {
  attempt_id: string;
  batch_id: string;
  state: string;
  not_dispatched: boolean;
  created_at?: string;
  updated_at?: string;
  has_output: boolean;
  error_code?: string;
  error_message?: string;
  execution_session_id?: string;
  execution_agent_id?: string;
  execution_status?: string;
};
export type SecretaryTaskPage = {
  items: SecretaryTask[];
  next_cursor?: string;
};
export type SecretaryTaskDetail = {
  task: SecretaryTask;
  attempts: SecretaryTaskAttempt[];
  next_cursor?: string;
};
export type SecretaryTaskAction = {
  action: "pause" | "resume" | "retry" | "recheck";
  expected_revision: number;
  batch_id: string;
  attempt_id: string;
  retry_epoch: number;
  settings_revision: number;
  confirm_restart?: boolean;
};
export type SecretaryTaskActionResult = {
  task: SecretaryTask;
  outcome?: string;
};
type PageInput = { cursor?: string; limit?: number };

function taskParams(input: PageInput) {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  return params;
}
export function getSecretaryTasks(
  userId: string,
  input: PageInput = {},
  signal?: AbortSignal,
) {
  return apiFetch<SecretaryTaskPage>(
    userPath(userId, `/secretary/tasks?${taskParams(input)}`),
    { signal },
  );
}
export function getSecretaryTask(
  userId: string,
  taskId: string,
  input: PageInput = {},
  signal?: AbortSignal,
) {
  return apiFetch<SecretaryTaskDetail>(
    userPath(
      userId,
      `/secretary/tasks/${encodeURIComponent(taskId)}?${taskParams(input)}`,
    ),
    { signal },
  );
}
export function controlSecretaryTask(
  userId: string,
  taskId: string,
  input: SecretaryTaskAction,
) {
  return apiFetch<SecretaryTaskActionResult>(
    userPath(userId, `/secretary/tasks/${encodeURIComponent(taskId)}/actions`),
    {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        expected_revision: input.expected_revision,
        batch_id: input.batch_id,
        attempt_id: input.attempt_id,
        retry_epoch: input.retry_epoch,
        settings_revision: input.settings_revision,
        ...(input.confirm_restart !== undefined
          ? { confirm_restart: input.confirm_restart }
          : {}),
      }),
    },
  );
}

export const secretaryTaskKeys = {
  all: (userId: string) => ["secretary-tasks", userId] as const,
  list: (userId: string) => ["secretary-tasks", userId, "list"] as const,
  detail: (userId: string, taskId: string) =>
    ["secretary-tasks", userId, "detail", taskId] as const,
};
function retryRead(failures: number, error: Error) {
  return (
    !(
      error instanceof AuthError ||
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      (error instanceof ApiError && error.status < 500)
    ) && failures < 2
  );
}
export function useSecretaryTasks(userId: string | undefined) {
  const client = useQueryClient();
  const queryKey = secretaryTaskKeys.list(userId ?? "pending");
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getSecretaryTasks(userId!, { cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId),
    refetchInterval: 5000,
    refetchOnMount: "always",
    retry: retryRead,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}
export function useSecretaryTaskDetail(
  userId: string,
  taskId: string,
  enabled: boolean,
) {
  const client = useQueryClient();
  const queryKey = secretaryTaskKeys.detail(userId, taskId);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getSecretaryTask(userId, taskId, { cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled,
    refetchInterval: enabled ? 5000 : false,
    refetchOnMount: "always",
    retry: retryRead,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}
export function useSecretaryTaskAction(
  userId: string,
  taskId: string,
  onResult?: (result?: SecretaryTaskActionResult, error?: Error) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SecretaryTaskAction) =>
      controlSecretaryTask(userId, taskId, input),
    retry: false,
    onMutate: () =>
      client.cancelQueries({ queryKey: secretaryTaskKeys.all(userId) }),
    onSuccess: (result) => onResult?.(result),
    onError: (error) => onResult?.(undefined, error),
    // Even a lost response can follow a committed write. Read the persisted
    // task before offering another action; never repeat a control POST blindly.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: secretaryTaskKeys.all(userId) }),
        client.invalidateQueries({ queryKey: ["secretary", userId] }),
        client.invalidateQueries({ queryKey: ["secretary-summaries", userId] }),
      ]).then(() => undefined),
  });
}
