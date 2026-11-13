"use client";
import { useI18n, type Locale } from "@/features/i18n/use-i18n";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { ApiError, AuthError } from "@/features/api/errors";
import { SecretarySessionControl } from "./secretary-user-control";
import {
  useSecretaryTasks,
  useSecretaryTaskDetail,
  useSecretaryTaskAction,
  type SecretaryTask,
  type SecretaryTaskAttempt,
  type SecretaryTaskAction,
  type SecretaryTaskActionResult,
  type SecretaryTaskState,
} from "@/features/api/secretary-tasks";

const labels: Record<SecretaryTaskState, string> = {
  queued: "Queued",
  waiting_source: "Waiting for source",
  waiting_retry: "Waiting to retry",
  running: "In progress",
  needs_recovery: "Awaiting recovery",
  output_received: "Output saved",
  unknown: "Outcome unknown",
  failed: "Failed",
  blocked: "Retry required",
  completed: "Up to date",
};
const safeReasons: Record<string, string> = {
  source_incomplete: "Waiting for the source turn to finish.",
  model_connection_failed:
    "Model connection failed. This request did not complete; its outcome needs checking before a restart.",
  execution_unknown:
    "The execution outcome is unknown. Check its existing result or explicitly restart this task.",
  connection_backoff:
    "The agent connection was unavailable before dispatch. Secretary will retry automatically.",
  connection_retries_exhausted:
    "The connection retry limit was reached. Retry this task when its agent is available.",
  invalid_output:
    "The existing result could not be published because its output was invalid.",
  execution_failed:
    "The execution failed. Review its execution before retrying this task.",
  retry_required:
    "Automatic processing has stopped. Review this task before retrying.",
};
function reason(code: string | undefined, historical = false) {
  if (historical && code === "connection_backoff")
    return "The agent connection was unavailable before this attempt could be dispatched.";
  return code ? safeReasons[code] : undefined;
}
function timestamp(value: string | undefined, locale: Locale) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString(locale);
}
function outcomeText(outcome?: string) {
  switch (outcome) {
    case "recovered":
      return "Existing result recovered and published. No new model request was sent.";
    case "still_unknown":
      return "The existing result is still unknown. No new model request was sent.";
    case "result_invalid":
      return "The existing result could not be published. No new model request was sent.";
    case "result_failed":
      return "The existing execution was confirmed as failed. No new model request was sent by this check. Future retries follow the task's retry limit.";
    case "output_saved":
      return "Existing output is saved and awaiting publication. No new model request was sent.";
    case "queued":
      return "This task was queued for a new attempt against its current source.";
    case "paused":
      return "Future retries are paused for this task. A current execution can still finish.";
    case "resumed":
      return "Future scheduling resumed for this task. Unconfirmed executions still require a result check or an explicit retry.";
    default:
      return "Task status refreshed.";
  }
}
function actionError(error: Error | null | undefined) {
  if (error instanceof AuthError)
    return "Sign in again to manage Secretary tasks.";
  if (error instanceof ApiError && error.status === 409)
    return "Task changed or is active. Its latest state is being loaded; review it before trying again.";
  if (error instanceof ApiError && error.status === 404)
    return "This task is no longer available. The list is being refreshed.";
  return "Could not confirm the action. The latest task state is being loaded; review it before trying again.";
}

export function SecretaryTaskList({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const list = useSecretaryTasks(userId);
  const [notice, setNotice] = useState("");
  const denied = list.error instanceof AuthError;
  const tasks = new Map<string, SecretaryTask>();
  if (!denied)
    for (const page of list.data?.pages ?? [])
      for (const task of page.items) tasks.set(task.task_id, task);
  const notify = (result?: SecretaryTaskActionResult, error?: Error) =>
    setNotice(error ? actionError(error) : outcomeText(result?.outcome));
  return (
    <section
      aria-label={t("Secretary tasks")}
      className="min-w-0 border-t border-hairline pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">{t("Tasks")}</h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={list.isFetching}
          onClick={() => {
            void list.restart();
          }}
        >
          {t("Refresh tasks")}
        </Button>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-tertiary">
        {t(
          "Each task follows one source session. Checking uses the existing execution and never starts a new model request. Pausing future retries does not cancel an execution already in progress.",
        )}
      </p>
      {notice && (
        <p className="mt-3 text-xs leading-5 text-ink-muted" role="status">
          {t(notice)}
        </p>
      )}
      {list.isError && (
        <p className="mt-3 text-xs leading-5 text-warning" role="alert">
          {denied
            ? t("Sign in again to view Secretary tasks.")
            : t(
                "Tasks could not be refreshed. Refresh tasks to load the latest state.",
              )}
        </p>
      )}
      {!denied && list.isPending ? (
        <p className="mt-3 text-xs text-ink-tertiary" role="status">
          {t("Loading tasks…")}
        </p>
      ) : !denied && !list.isError && tasks.size === 0 ? (
        <p className="mt-3 text-xs text-ink-tertiary">
          {t("No pending summary tasks.")}
        </p>
      ) : null}
      <div className="mt-3 space-y-3">
        {[...tasks.values()].map((task) => (
          <SecretaryTaskRow
            key={`${userId}:${task.task_id}`}
            task={task}
            userId={userId}
            enabled={enabled}
            notify={notify}
            refreshTasks={() => {
              void list.restart();
            }}
          />
        ))}
      </div>
      {!denied && list.hasNextPage && (
        <Button
          className="mt-3 min-h-11 sm:min-h-8"
          size="sm"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t("More tasks")}
        </Button>
      )}
    </section>
  );
}

function SecretaryTaskRow({
  task: listed,
  userId,
  enabled,
  notify,
  refreshTasks,
}: {
  task: SecretaryTask;
  userId: string;
  enabled: boolean;
  notify: (result?: SecretaryTaskActionResult, error?: Error) => void;
  refreshTasks: () => void;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [restart, setRestart] = useState<SecretaryTask>();
  const detail = useSecretaryTaskDetail(userId, listed.task_id, expanded);
  const action = useSecretaryTaskAction(userId, listed.task_id, notify);
  const task =
    expanded && !detail.isError
      ? (detail.data?.pages[0]?.task ?? listed)
      : listed;
  const taskDenied =
    expanded &&
    (detail.error instanceof AuthError ||
      (detail.error instanceof ApiError && detail.error.status === 404));
  if (taskDenied)
    return (
      <article
        aria-label={t("Unavailable task")}
        className="min-w-0 rounded-md border border-hairline bg-surface-1 p-3"
      >
        <p className="text-xs leading-5 text-warning" role="alert">
          {detail.error instanceof AuthError
            ? t("Sign in again to view this task.")
            : t(
                "This task is no longer available. Refresh tasks to load the current list.",
              )}
        </p>
        <Button
          className="mt-2 min-h-11 sm:min-h-8"
          size="sm"
          onClick={refreshTasks}
        >
          {t("Refresh tasks")}
        </Button>
      </article>
    );
  const canCheck =
    Boolean(task.attempt_id) &&
    ["unknown", "needs_recovery", "running", "output_received"].includes(
      task.execution_state,
    );
  const disabled = action.isPending;
  const needsRestartConfirmation = [
    "unknown",
    "needs_recovery",
    "running",
  ].includes(task.execution_state);
  const execute = (
    name: SecretaryTaskAction["action"],
    observed = task,
    confirm = false,
  ) => {
    action.mutate({
      action: name,
      expected_revision: observed.revision,
      batch_id: observed.batch_id,
      attempt_id: observed.attempt_id,
      retry_epoch: observed.retry_epoch,
      settings_revision: observed.settings_revision,
      ...(confirm ? { confirm_restart: true } : {}),
    });
  };
  const retryAt =
    task.execution_state === "waiting_retry" && !task.paused
      ? timestamp(task.next_retry_at, locale)
      : undefined;
  const taskReason =
    task.paused && task.error_code === "connection_backoff"
      ? t(
          "The agent connection was unavailable before dispatch. Future retries are paused.",
        )
      : reason(task.error_code);
  return (
    <article
      aria-label={task.title || t("Untitled session")}
      className="min-w-0 rounded-md border border-hairline bg-surface-1 p-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <Link
          href={`/?session_id=${encodeURIComponent(task.session_id)}`}
          className="min-w-0 text-sm font-medium text-ink hover:text-accent-bright"
        >
          <TruncatedText>{task.title || t("Untitled session")}</TruncatedText>
        </Link>
        <div className="flex max-w-48 shrink-0 flex-wrap justify-end gap-1">
          <Badge
            tone={
              ["unknown", "failed", "blocked", "needs_recovery"].includes(
                task.execution_state,
              )
                ? "warning"
                : "neutral"
            }
          >
            {t(labels[task.execution_state] ?? "Pending")}
          </Badge>
          {task.paused && <Badge tone="warning">{t("Paused")}</Badge>}
        </div>
      </div>
      {taskReason && (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          {t(taskReason ?? "")}
        </p>
      )}
      <p className="mt-1 text-xs leading-5 text-ink-tertiary">
        {task.attempt_count}{" "}
        {task.attempt_count === 1 ? t("attempt") : t("attempts")}
        {task.connection_failures > 0
          ? t(" · {value1} connection {value2}", {
              value1: task.connection_failures,
              value2: task.connection_failures === 1 ? "failure" : "failures",
            })
          : ""}
        {retryAt && !task.paused
          ? t(" · Next retry {value1}", { value1: retryAt })
          : ""}
        {task.lease_active ? t(" · Operation in progress") : ""}
      </p>
      <div data-testid="task-controls" className="mt-2 flex flex-wrap gap-1.5">
        <SecretarySessionControl
          userId={userId}
          sourceId={task.task_id}
          operationId={task.operation_id}
        />
        {task.execution_session_id && (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-8"
          >
            <Link
              href={`/?session_id=${encodeURIComponent(task.execution_session_id)}`}
            >
              {t("View execution")}
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          className="min-h-11 sm:min-h-8"
          disabled={disabled || !enabled || task.lease_active || !canCheck}
          onClick={() => execute("recheck")}
        >
          {t("Check existing result")}
        </Button>
        <Button
          size="sm"
          className="min-h-11 sm:min-h-8"
          disabled={
            disabled ||
            !enabled ||
            task.lease_active ||
            task.execution_state === "completed"
          }
          onClick={() => {
            if (needsRestartConfirmation) setRestart(task);
            else execute("retry");
          }}
        >
          {t("Retry this task")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={disabled}
          onClick={() => execute(task.paused ? "resume" : "pause")}
        >
          {task.paused ? t("Resume") : t("Pause future retries")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          aria-expanded={expanded}
          disabled={action.isPending}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t("Hide details") : t("Task details")}
        </Button>
      </div>
      {action.isError && (
        <p className="mt-2 text-xs leading-5 text-warning" role="alert">
          {t(actionError(action.error))}
        </p>
      )}
      {action.isSuccess && (
        <p className="mt-2 text-xs leading-5 text-ink-muted" role="status">
          {t(outcomeText(action.data?.outcome))}
        </p>
      )}
      {expanded && <TaskAttemptHistory detail={detail} />}
      <ConfirmDialog
        open={Boolean(restart)}
        onOpenChange={(open) => {
          if (!open) setRestart(undefined);
        }}
        title={t("Restart this summary task?")}
        confirmLabel={t("Restart this task")}
        disabled={action.isPending}
        description={t(
          "The previous execution may still be running. Restarting can create duplicate work and another model request. This restarts only this source session against its current content; your existing summaries remain available.",
        )}
        onConfirm={() => {
          if (restart) execute("retry", restart, true);
          setRestart(undefined);
        }}
      />
    </article>
  );
}

function TaskAttemptHistory({
  detail,
}: {
  detail: ReturnType<typeof useSecretaryTaskDetail>;
}) {
  const { t, locale } = useI18n();
  if (detail.error instanceof AuthError)
    return (
      <p className="mt-3 text-xs text-warning" role="alert">
        {t("Sign in again to view task details.")}
      </p>
    );
  const first = detail.data?.pages[0];
  const attempts = new Map<string, SecretaryTaskAttempt>();
  for (const page of detail.data?.pages ?? [])
    for (const attempt of page.attempts)
      attempts.set(attempt.attempt_id, attempt);
  return (
    <div className="mt-3 min-w-0 border-t border-hairline pt-3">
      {detail.isError && (
        <p className="text-xs text-warning" role="alert">
          {t(
            "Attempt history is unavailable or its cursor expired. Reload details to check the current state.",
          )}
        </p>
      )}
      {detail.isPending && (
        <p className="text-xs text-ink-tertiary" role="status">
          {t("Loading task details…")}
        </p>
      )}
      {first && (
        <>
          <dl className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-ink-tertiary">{t("Task / source")}</dt>
              <dd>
                <MonoId>{first.task.task_id}</MonoId>
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">{t("Current fixed batch")}</dt>
              <dd>
                <MonoId>{first.task.batch_id || t("Not prepared")}</MonoId>
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">{t("Current attempt")}</dt>
              <dd>
                <MonoId>{first.task.attempt_id || t("Not dispatched")}</MonoId>
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">
                {t("Control revision / retry epoch")}
              </dt>
              <dd>
                {first.task.revision} / {first.task.retry_epoch}
              </dd>
            </div>
          </dl>
          <h3 className="mt-3 text-xs font-medium text-ink">
            {t("Attempt history")}
          </h3>
          {!attempts.size && (
            <p className="mt-1 text-xs text-ink-tertiary">
              {t("No attempts recorded.")}
            </p>
          )}
          <ol className="mt-1 divide-y divide-hairline">
            {[...attempts.values()].map((attempt) => (
              <li key={attempt.attempt_id} className="min-w-0 py-2 text-xs">
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-ink-muted">
                  <span>
                    {attempt.not_dispatched
                      ? t("Not dispatched")
                      : attempt.state === "committed"
                        ? t("Published")
                        : attempt.has_output
                          ? t("Output saved")
                          : attempt.state === "unknown"
                            ? t("Outcome unknown")
                            : attempt.state === "running"
                              ? t("In progress")
                              : t("Finished attempt")}
                  </span>
                  {timestamp(attempt.updated_at, locale) && (
                    <span className="text-ink-tertiary">
                      {timestamp(attempt.updated_at, locale)}
                    </span>
                  )}
                </div>
                <MonoId>{attempt.attempt_id}</MonoId>
                <MonoId>{attempt.batch_id}</MonoId>
                {reason(attempt.error_code, true) && (
                  <p className="mt-1 leading-5 text-ink-muted">
                    {t(reason(attempt.error_code, true) ?? "")}
                  </p>
                )}
                {attempt.execution_session_id && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="mt-1 min-h-11 sm:min-h-8"
                  >
                    <Link
                      href={`/?session_id=${encodeURIComponent(attempt.execution_session_id)}`}
                    >
                      {t("View attempt execution")}
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {detail.isError ? (
        <Button
          size="sm"
          className="mt-2"
          disabled={detail.isFetching}
          onClick={() => {
            void detail.restart();
          }}
        >
          {t("Reload details")}
        </Button>
      ) : detail.hasNextPage ? (
        <Button
          size="sm"
          className="mt-2 min-h-11 sm:min-h-8"
          disabled={detail.isFetchingNextPage}
          onClick={() => {
            void detail.fetchNextPage();
          }}
        >
          {t("More attempts")}
        </Button>
      ) : null}
    </div>
  );
}
