"use client";

import { useCallback, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { AdminAnalyticsNav } from "@/components/analytics/admin-analytics-nav";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { MonoId } from "@/components/ui/text";
import { AuthGate } from "@/features/auth/auth-gate";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import {
  useDeveloperSummaries,
  type DeveloperSummarySelection,
} from "@/features/api/developer-summaries";
import { AuthError } from "@/features/api/errors";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { SummaryDeveloperDetail } from "./summary-developer-detail";

export function SummaryBrowserPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <SummaryBrowserAccess user={user} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function SummaryBrowserAccess({ user }: { user: User }) {
  const preview = useConsoleStore((state) => state.previewAsUser);
  if (!canSeeAdminFeatures(user, preview)) {
    return (
      <p role="alert" className="p-6 text-sm text-ink-muted">
        Summary developer is available to administrators.
      </p>
    );
  }
  return <SummaryBrowser key={user.user_id} userId={user.user_id} />;
}

function SummaryBrowser({ userId }: { userId: string }) {
  const list = useDeveloperSummaries(userId);
  const [selection, setSelection] = useState<DeveloperSummarySelection>();
  const [summaryId, setSummaryId] = useState("");
  const [revision, setRevision] = useState("");
  const [validationError, setValidationError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const denyAccess = useCallback(() => setAccessDenied(true), []);
  const items =
    list.isError || accessDenied
      ? []
      : [
          ...new Map(
            list.data?.pages
              .flatMap((page) => page.items)
              .map((item) => [item.summary_id, item]),
          ).values(),
        ];

  function openSummary(event: FormEvent) {
    event.preventDefault();
    const id = summaryId.trim();
    const version = revision.trim();
    if (
      !id ||
      (version &&
        (!/^\d+$/.test(version) ||
          !Number.isSafeInteger(Number(version)) ||
          Number(version) < 1))
    ) {
      setValidationError(
        "Enter a summary ID and a positive revision, or leave revision blank for current.",
      );
      return;
    }
    setValidationError("");
    setSelection({ id, ...(version ? { revision: Number(version) } : {}) });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <AdminAnalyticsNav />
        <header className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              Summary developer
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Inspect your summaries, immutable versions, and source references.
            </p>
          </div>
          <Button
            aria-label="Refresh summaries"
            disabled={list.isFetching}
            icon={
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`}
              />
            }
            onClick={() => {
              setSelection(undefined);
              setAccessDenied(false);
              void list.restart();
            }}
          >
            Refresh
          </Button>
        </header>
      </div>
      {list.isError || accessDenied ? (
        <div
          role="alert"
          className="mx-4 border-t border-hairline py-5 text-sm text-ink-muted sm:mx-6"
        >
          <p>
            {accessDenied || list.error instanceof AuthError
              ? "Access denied. Administrator permission is required to read summary data."
              : "Could not load summaries. Refresh to restart the list."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-hairline">
          <section
            aria-label="Current summaries"
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${selection ? "hidden lg:block lg:max-w-sm lg:border-r lg:border-hairline" : ""}`}
          >
            <div className="border-b border-hairline p-4 sm:px-6">
              <h2 className="text-sm font-semibold text-ink">
                Your current summaries
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-tertiary">
                Latest readable version per summary, ordered by ID. No keyword
                required.
              </p>
              <form
                aria-label="Open summary by ID"
                onSubmit={openSummary}
                className="mt-4 grid min-w-0 gap-3"
              >
                <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
                  Summary ID
                  <input
                    className="min-h-9 min-w-0 w-full rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink"
                    value={summaryId}
                    onChange={(event) => setSummaryId(event.target.value)}
                    placeholder="summary_…"
                    required
                  />
                </label>
                <div className="flex min-w-0 items-end gap-2">
                  <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink-muted">
                    Revision
                    <input
                      className="min-h-9 min-w-0 w-full rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink"
                      value={revision}
                      onChange={(event) => setRevision(event.target.value)}
                      inputMode="numeric"
                      placeholder="Current"
                      maxLength={16}
                    />
                  </label>
                  <Button type="submit">Open summary</Button>
                </div>
                {validationError && (
                  <p role="alert" className="text-xs text-warning">
                    {validationError}
                  </p>
                )}
              </form>
            </div>
            {list.isPending ? (
              <p role="status" className="p-5 text-sm text-ink-tertiary">
                Loading summaries…
              </p>
            ) : (
              <>
                <ul
                  aria-label="Summary list"
                  className="divide-y divide-hairline"
                >
                  {items.map((item) => (
                    <li key={item.summary_id}>
                      <button
                        type="button"
                        aria-label={`Open ${item.title || item.summary_id}, version ${item.revision}`}
                        aria-pressed={
                          selection?.id === item.summary_id &&
                          selection?.revision === item.revision
                        }
                        onClick={() =>
                          setSelection({
                            id: item.summary_id,
                            revision: item.revision,
                          })
                        }
                        className={`w-full min-w-0 px-4 py-4 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent sm:px-6 ${selection?.id === item.summary_id ? "bg-accent/10" : ""}`}
                      >
                        <span className="block break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">
                          {item.title || "Untitled summary"}
                        </span>
                        <span className="mt-1 line-clamp-3 block break-words text-xs leading-5 text-ink-muted [overflow-wrap:anywhere]">
                          {item.body_preview || "No text preview"}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-tertiary">
                          <span>v{item.revision}</span>
                          <span>{item.coverage_count} source messages</span>
                          <span>{item.claim_count} claims</span>
                        </span>
                        <span className="mt-2 block min-w-0">
                          <MonoId>{item.summary_id}</MonoId>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!items.length && !list.hasNextPage && (
                  <p className="p-5 text-sm text-ink-muted">
                    No summaries yet.
                  </p>
                )}
                {!items.length && list.hasNextPage && (
                  <p className="px-5 pt-4 text-xs text-ink-tertiary">
                    No readable summaries in this page. More records are
                    available.
                  </p>
                )}
                {list.hasNextPage && (
                  <div className="p-4">
                    <Button
                      disabled={list.isFetchingNextPage}
                      onClick={() => {
                        void list.fetchNextPage();
                      }}
                    >
                      {list.isFetchingNextPage
                        ? "Loading more…"
                        : "Load more summaries"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
          {selection ? (
            <SummaryDeveloperDetail
              key={`${selection.id}:${selection.revision ?? "current"}`}
              userId={userId}
              selection={selection}
              onClose={() => setSelection(undefined)}
              onSelect={setSelection}
              onAccessDenied={denyAccess}
            />
          ) : (
            <div className="hidden min-w-0 flex-1 items-center justify-center px-6 text-sm text-ink-tertiary lg:flex">
              Select a summary to inspect its content and data.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
