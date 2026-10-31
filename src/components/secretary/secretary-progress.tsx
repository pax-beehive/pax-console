"use client";

import Link from "next/link";
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

type ProgressQuery = ReturnType<typeof useSecretaryProgress>;
const stateLabels = {
  completed: "Up to date",
  partial: "Partly summarized",
  unstarted: "Awaiting summary",
};

export function coverageText(counts: SecretaryCoverageCounts) {
  const turns = counts.ungrouped_messages === 0 && counts.total_turns > 0;
  const total = turns ? counts.total_turns : counts.total_messages;
  const completed = turns ? counts.completed_turns : counts.completed_messages;
  const pending = turns ? counts.pending_turns : counts.pending_messages;
  return `${completed} of ${total} ${turns ? (total === 1 ? "turn" : "turns") : total === 1 ? "message" : "messages"} summarized · ${pending} remaining`;
}

function visiblePage(progress: ProgressQuery) {
  return progress.error instanceof AuthError
    ? undefined
    : progress.data?.pages[0];
}

export function SecretaryProgressOverview({
  progress,
}: {
  progress: ProgressQuery;
}) {
  const page = visiblePage(progress);
  return (
    <section
      aria-label="Summary progress"
      className="rounded-md border border-hairline bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-ink-subtle">
          Summary progress
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
          Refresh progress
        </Button>
      </div>
      {!page ? (
        progress.isError ? (
          <div className="mt-3 text-xs leading-5 text-warning" role="alert">
            {progress.error instanceof AuthError
              ? "Sign in again to view summary progress."
              : "Summary progress is unavailable. Refresh to try again."}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-tertiary" role="status">
            Loading summary progress…
          </p>
        )
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            <ProgressCount
              label="Sessions tracked"
              value={page.counts.total_sessions}
            />
            <ProgressCount
              label="Up to date"
              value={page.counts.completed_sessions}
            />
            <ProgressCount
              label="Partly summarized"
              value={page.counts.partial_sessions}
            />
            <ProgressCount
              label="Awaiting summary"
              value={page.counts.unstarted_sessions}
            />
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            {coverageText(page.counts)}
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-tertiary">
            Only published summaries count toward progress. Counts update as
            sessions change.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-tertiary">
              Updated {formatDate(page.as_of)}
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
                  View sessions
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
  progress,
  agents,
}: {
  progress: ProgressQuery;
  agents: Agent[];
}) {
  const page = visiblePage(progress);
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
      aria-label="Session summary progress"
      className="scroll-mt-4 border-t border-hairline pt-4"
      id="secretary-session-progress"
    >
      <h2 className="text-sm font-medium text-ink">Sessions</h2>
      <p className="mt-1 text-xs leading-5 text-ink-tertiary">
        Progress covers current messages. Where turn counts aren’t available,
        progress is shown as messages.
      </p>
      {!page.counts.total_sessions ? (
        <p className="mt-4 text-sm leading-6 text-ink-muted">
          No sessions with readable messages yet.
        </p>
      ) : (
        <p className="my-3 text-xs text-ink-tertiary">
          Showing {sessions.length} of {page.counts.total_sessions} sessions
        </p>
      )}
      <ul
        aria-label="Session progress list"
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
                  {session.title || "Untitled session"}
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
                {stateLabels[session.state]}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {coverageText(session)}
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
                Last summary {formatDate(session.last_completed_at)}
              </p>
            )}
          </li>
        ))}
      </ul>
      {progress.isError && (
        <div className="my-3 text-xs leading-5 text-warning" role="alert">
          {expiredCursor
            ? "The session list changed. Refresh progress to continue."
            : "Could not refresh progress. The last loaded results are shown."}
          <Button
            className="ml-2"
            onClick={() => {
              void progress.restart();
            }}
            size="sm"
          >
            Retry progress
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
            ? "Loading sessions…"
            : "Load more sessions"}
        </Button>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}
