"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { SettingsPageHeader } from "@/components/settings/settings-navigation";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/features/auth/auth-gate";
import { ApiError } from "@/features/api/errors";
import {
  useSecretarySummaries,
  type SecretarySummarySelection,
} from "@/features/api/secretary-summaries";
import { SecretarySummaryDetail } from "./secretary-summary-detail";
import { isSummaryAccessDenied, summaryDate } from "./secretary-summary-format";

const summariesPath = "/settings/secretary/summaries";

export function secretarySummaryHref(selection?: SecretarySummarySelection) {
  if (!selection) return summariesPath;
  const params = new URLSearchParams({ summary_id: selection.id });
  if (selection.revision) params.set("revision", String(selection.revision));
  return `${summariesPath}?${params}`;
}

export function SecretarySummariesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("summary_id");
  const revision = params.get("revision");
  const invalidRevision = Boolean(
    revision &&
    (!/^\d+$/.test(revision) ||
      !Number.isSafeInteger(Number(revision)) ||
      Number(revision) < 1),
  );
  const selection =
    id && !invalidRevision
      ? { id, ...(revision ? { revision: Number(revision) } : {}) }
      : undefined;

  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <SecretarySummaryBrowser
            key={user.user_id}
            userId={user.user_id}
            selection={selection}
            invalidSelection={invalidRevision}
            onNavigate={(href) => router.push(href, { scroll: false })}
          />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function SecretarySummaryBrowser({
  userId,
  selection,
  invalidSelection = false,
  onNavigate,
}: {
  userId: string;
  selection?: SecretarySummarySelection;
  invalidSelection?: boolean;
  onNavigate: (href: string) => void;
}) {
  const list = useSecretarySummaries(userId);
  const [accessDenied, setAccessDenied] = useState(false);
  const denyAccess = useCallback(() => setAccessDenied(true), []);
  const denied = accessDenied || isSummaryAccessDenied(list.error);
  const listFailed = list.isError && !list.isFetchNextPageError;
  const checking = list.isFetching && !list.isFetchedAfterMount;
  const items =
    denied || listFailed || checking
      ? []
      : [
          ...new Map(
            list.data?.pages
              .flatMap((page) => page.items)
              .map((item) => [item.summary_id, item]),
          ).values(),
        ];
  const cursorExpired =
    list.error instanceof ApiError && list.error.status === 400;

  function refresh() {
    onNavigate(summariesPath);
    void list.restart().then(() => setAccessDenied(false));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <SettingsPageHeader
        title="Summaries"
        category="Secretary"
        description="Browse your published summaries and their original messages."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/settings/secretary">Secretary settings</Link>
          </Button>
          <Button
            size="sm"
            aria-label="Refresh summaries"
            disabled={list.isFetching}
            icon={
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${list.isFetching ? "animate-spin" : ""}`}
              />
            }
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>
      </SettingsPageHeader>
      {denied ? (
        <p role="alert" className="p-5 text-sm leading-6 text-ink-muted">
          These summaries are no longer available to you. Refresh to check your
          access again.
        </p>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <section
            aria-label="Your summaries"
            data-viewport-scroll
            className={`min-h-0 min-w-0 overflow-y-auto ${selection ? "hidden lg:block lg:w-80 lg:shrink-0 lg:border-r lg:border-hairline" : "flex-1"}`}
          >
            <div className="border-b border-hairline px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-ink">Your summaries</h2>
              <p className="mt-1 text-xs leading-5 text-ink-tertiary">
                Newest summaries first. Each entry shows its latest published
                version.
              </p>
            </div>
            {invalidSelection && (
              <p
                role="alert"
                className="px-4 py-3 text-sm text-warning sm:px-6"
              >
                This summary link has an invalid version. Choose a summary
                below.
              </p>
            )}
            {list.isPending || checking ? (
              <p role="status" className="p-5 text-sm text-ink-tertiary">
                Loading summaries…
              </p>
            ) : listFailed ? (
              <p role="alert" className="p-5 text-sm leading-6 text-ink-muted">
                Could not load summaries. Refresh to try again.
              </p>
            ) : (
              <>
                <ul
                  aria-label="Summary list"
                  className="divide-y divide-hairline"
                >
                  {items.map((item) => (
                    <li key={item.summary_id}>
                      <Link
                        href={secretarySummaryHref({
                          id: item.summary_id,
                          revision: item.revision,
                        })}
                        scroll={false}
                        aria-label={`Read ${item.title || "Untitled summary"}, version ${item.revision}`}
                        aria-current={
                          selection?.id === item.summary_id ? "page" : undefined
                        }
                        className={`block min-w-0 px-4 py-4 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent sm:px-6 ${selection?.id === item.summary_id ? "bg-accent/10" : ""}`}
                      >
                        <span className="block break-words text-sm font-medium leading-6 text-ink [overflow-wrap:anywhere]">
                          {item.title || "Untitled summary"}
                        </span>
                        <span className="mt-1 line-clamp-3 block break-words text-xs leading-5 text-ink-muted [overflow-wrap:anywhere]">
                          {item.body_preview || "Open to read this summary."}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-tertiary">
                          <time dateTime={item.created_at}>
                            {summaryDate(item.created_at)}
                          </time>
                          <span>v{item.revision}</span>
                          <span>{item.coverage_count} source messages</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {!items.length && !list.hasNextPage && (
                  <div className="p-5 text-sm leading-6 text-ink-muted">
                    <p>No published summaries yet.</p>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      Published results appear here after a summary is ready.
                      You can check progress in Secretary settings.
                    </p>
                  </div>
                )}
                {!items.length && list.hasNextPage && (
                  <p className="px-5 pt-4 text-xs leading-5 text-ink-tertiary">
                    No readable summaries in this page. More records are
                    available.
                  </p>
                )}
                {list.isFetchNextPageError && (
                  <p
                    role="alert"
                    className="px-5 pt-4 text-xs leading-5 text-warning"
                  >
                    {cursorExpired
                      ? "This list has changed. Refresh summaries to start again."
                      : "Could not load more summaries. Your loaded results are still shown."}
                  </p>
                )}
                {list.hasNextPage && !cursorExpired && (
                  <div className="p-4 sm:px-6">
                    <Button
                      size="sm"
                      disabled={list.isFetching}
                      onClick={() => {
                        void list.fetchNextPage();
                      }}
                    >
                      {list.isFetchingNextPage
                        ? "Loading more…"
                        : list.isFetchNextPageError
                          ? "Retry loading more"
                          : "Load more summaries"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
          {selection && (
            <SecretarySummaryDetail
              key={JSON.stringify([userId, selection.id, selection.revision])}
              userId={userId}
              selection={selection}
              onClose={() => onNavigate(summariesPath)}
              onSelect={(next) => onNavigate(secretarySummaryHref(next))}
              onAccessDenied={denyAccess}
            />
          )}
        </div>
      )}
    </div>
  );
}
