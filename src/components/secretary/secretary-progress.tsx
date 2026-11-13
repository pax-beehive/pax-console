"use client";
import {
  useI18n,
  type Translator,
  type Locale,
} from "@/features/i18n/use-i18n";

import Link from "next/link";
import { translators } from "@/features/i18n/translate";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { AuthError, ApiError } from "@/features/api/errors";
import {
  SecretaryCoverageCounts,
  SecretarySessionProgress,
  useSecretaryProgress,
} from "@/features/api/secretary-progress";
import { Agent } from "@/features/api/types";
import { SecretarySessionControl } from "./secretary-user-control";

type ProgressQuery = ReturnType<typeof useSecretaryProgress>;
const stateLabels = {
  completed: "Up to date",
  partial: "Partly processed",
  unstarted: "Awaiting processing",
};

export function coverageText(
  counts: SecretaryCoverageCounts,
  t: Translator = translators.en,
) {
  const turns = counts.ungrouped_messages === 0 && counts.total_turns > 0;
  const total = turns ? counts.total_turns : counts.total_messages;
  const completed = turns ? counts.completed_turns : counts.completed_messages;
  const pending = turns ? counts.pending_turns : counts.pending_messages;
  return t("{completed} of {total} {unit} processed · {pending} remaining", {
    completed,
    total,
    pending,
    unit: t(
      turns
        ? total === 1
          ? "turn"
          : "turns"
        : total === 1
          ? "message"
          : "messages",
    ),
  });
}

function visiblePage(progress: ProgressQuery) {
  return progress.error instanceof AuthError || progressIsUpdating(progress)
    ? undefined
    : progress.data?.pages[0];
}

function progressIsUpdating(progress: ProgressQuery) {
  return (
    progress.error instanceof ApiError &&
    progress.error.status === 503 &&
    progress.error.message ===
      "Secretary progress is updating. Please try again shortly."
  );
}

export function SecretaryProgressOverview({
  progress,
}: {
  progress: ProgressQuery;
}) {
  const { t, locale } = useI18n();
  const page = visiblePage(progress);
  return (
    <section
      aria-label={t("Summary progress")}
      className="rounded-md border border-hairline bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-ink-subtle">
          {t("Summary progress")}
        </h2>
        <Button
          disabled={progress.isFetching}
          icon={
            <RefreshCw
              aria-hidden="true"
              className={`h-3 w-3 ${progress.isFetching ? "animate-spin" : ""}`}
            />
          }
          onClick={() => {
            void progress.restart();
          }}
          size="sm"
          variant="ghost"
        >
          {t("Refresh progress")}
        </Button>
      </div>
      {progressIsUpdating(progress) ? (
        <p className="mt-3 text-xs leading-5 text-ink-tertiary" role="status">
          {t(
            "Summary progress is updating. Counts will refresh automatically.",
          )}
        </p>
      ) : !page ? (
        progress.isError ? (
          <div className="mt-3 text-xs leading-5 text-warning" role="alert">
            {progress.error instanceof AuthError
              ? t("Sign in again to view summary progress.")
              : progress.error?.name === "TimeoutError"
                ? t("Loading summary progress timed out. Refresh to try again.")
                : t("Summary progress is unavailable. Refresh to try again.")}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-tertiary" role="status">
            {t("Loading summary progress…")}
          </p>
        )
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            <ProgressCount
              label={t("Sessions tracked")}
              value={page.counts.total_sessions}
            />
            <ProgressCount
              label={t("Up to date")}
              value={page.counts.completed_sessions}
            />
            <ProgressCount
              label={t("Partly processed")}
              value={page.counts.partial_sessions}
            />
            <ProgressCount
              label={t("Awaiting processing")}
              value={page.counts.unstarted_sessions}
            />
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            {coverageText(page.counts, t)}
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-tertiary">
            {t(
              "Progress counts committed processing, including messages that need no summary. A message used by multiple summaries is counted once.",
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-tertiary">
              {t("Updated")} {formatDate(page.as_of, t, locale)}
            </p>
            {page.counts.total_sessions > 0 && (
              <Button asChild size="sm" variant="ghost">
                <a
                  href="#secretary-session-progress"
                  onClick={(event) => {
                    const target = document.getElementById(
                      "secretary-session-progress",
                    );
                    const container = target?.closest<HTMLElement>(
                      "[data-secretary-scroll]",
                    );
                    if (!target || !container) return;
                    event.preventDefault();
                    container.scrollTo({
                      top:
                        container.scrollTop +
                        target.getBoundingClientRect().top -
                        container.getBoundingClientRect().top,
                    });
                  }}
                >
                  {t("View sessions")}
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ProgressCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ink-tertiary">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

export function SecretarySessionProgressList({
  userId,
  progress,
  agents,
}: {
  userId: string;
  progress: ProgressQuery;
  agents: Agent[];
}) {
  const { t, locale } = useI18n();
  const page = visiblePage(progress);
  if (progressIsUpdating(progress)) {
    return (
      <section
        aria-label={t("Session summary progress")}
        className="scroll-mt-4 border-t border-hairline pt-4"
        id="secretary-session-progress"
      >
        <h2 className="text-sm font-medium text-ink">{t("Sessions")}</h2>
        <p className="mt-3 text-xs leading-5 text-ink-tertiary" role="status">
          {t(
            "Session progress is updating. The list will refresh automatically.",
          )}
        </p>
      </section>
    );
  }
  if (!page) return null;
  const rows = new Map<string, SecretarySessionProgress>();
  for (const item of progress.data?.pages ?? [])
    for (const session of item.sessions) rows.set(session.source_id, session);
  const sessions = [...rows.values()];
  const expiredCursor =
    progress.error instanceof ApiError &&
    /cursor/i.test(progress.error.message);
  return (
    <section
      aria-label={t("Session summary progress")}
      className="scroll-mt-4 border-t border-hairline pt-4"
      id="secretary-session-progress"
    >
      <h2 className="text-sm font-medium text-ink">{t("Sessions")}</h2>
      <p className="mt-1 text-xs leading-5 text-ink-tertiary">
        {t(
          "Progress covers current messages. Where turn counts aren’t available, progress is shown as messages.",
        )}
      </p>
      {!page.counts.total_sessions ? (
        <p className="mt-4 text-sm leading-6 text-ink-muted">
          {t("No sessions with readable messages yet.")}
        </p>
      ) : (
        <p className="my-3 text-xs text-ink-tertiary">
          {t("Showing")} {sessions.length} {t("of")}{" "}
          {page.counts.total_sessions} {t("sessions")}
        </p>
      )}
      <ul
        aria-label={t("Session progress list")}
        className="divide-y divide-hairline"
      >
        {sessions.map((session) => (
          <li key={session.source_id} className="min-w-0 py-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Link
                className="min-w-0 text-sm font-medium text-ink hover:text-accent-bright focus-visible:outline-2 focus-visible:outline-accent"
                href={`/?session_id=${encodeURIComponent(session.session_id)}`}
              >
                <TruncatedText>
                  {session.title || t("Untitled session")}
                </TruncatedText>
              </Link>
              <Badge
                tone={
                  session.state === "completed"
                    ? "success"
                    : session.state === "partial"
                      ? "accent"
                      : "neutral"
                }
              >
                {t(stateLabels[session.state])}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {coverageText(session, t)}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 max-w-full text-xs text-ink-tertiary">
                <TruncatedText>
                  {agents.find((agent) => agent.agent_id === session.agent_id)
                    ?.name || session.agent_id}
                </TruncatedText>
              </span>
              <MonoId>{session.session_id}</MonoId>
            </div>
            {session.last_completed_at && (
              <p className="mt-1 text-xs text-ink-tertiary">
                {t("Last processed")}{" "}
                {formatDate(session.last_completed_at, t, locale)}
              </p>
            )}
            <div className="mt-1">
              <SecretarySessionControl
                userId={userId}
                sourceId={session.source_id}
              />
            </div>
          </li>
        ))}
      </ul>
      {progress.isError && (
        <div className="my-3 text-xs leading-5 text-warning" role="alert">
          {expiredCursor
            ? t("The session list changed. Refresh progress to continue.")
            : t(
                "Could not refresh progress. The last loaded results are shown.",
              )}
          <Button
            className="ml-2"
            onClick={() => {
              void progress.restart();
            }}
            size="sm"
          >
            {t("Retry progress")}
          </Button>
        </div>
      )}
      {progress.hasNextPage && !progress.isError && (
        <Button
          className="mt-3 w-full justify-center"
          disabled={progress.isFetchingNextPage}
          onClick={() => {
            void progress.fetchNextPage();
          }}
          size="sm"
        >
          {progress.isFetchingNextPage
            ? t("Loading sessions…")
            : t("Load more sessions")}
        </Button>
      )}
    </section>
  );
}

function formatDate(value: string, t: Translator, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t("Unknown")
    : date.toLocaleString(locale);
}
