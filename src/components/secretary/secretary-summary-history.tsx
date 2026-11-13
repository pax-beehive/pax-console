"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { useEffect, useId, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/features/api/errors";
import {
  useSecretarySummaryRevisions,
  type SecretarySummarySelection,
} from "@/features/api/secretary-summaries";
import { isSummaryAccessDenied, summaryDate } from "./secretary-summary-format";

export function SecretarySummaryHistory({
  userId,
  summaryId,
  selectedRevision,
  onSelect,
  onAccessDenied,
}: {
  userId: string;
  summaryId: string;
  selectedRevision: number;
  onSelect: (selection: SecretarySummarySelection) => void;
  onAccessDenied: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const historyId = useId();
  const query = useSecretarySummaryRevisions(userId, summaryId, open);
  const denied = open && isSummaryAccessDenied(query.error);
  // Reopening the history rechecks access even when a warm page exists.
  const checking = query.isFetching && !query.isFetchingNextPage;
  const failed = query.isError && !query.isFetchNextPageError;
  const items =
    !open || denied || checking || failed
      ? []
      : [
          ...new Map(
            query.data?.pages
              .flatMap((page) => page.items)
              .filter((item) => item.summary_id === summaryId)
              .map((item) => [item.revision, item]),
          ).values(),
        ];
  const expired = query.error instanceof ApiError && query.error.status === 400;

  useEffect(() => {
    if (denied) onAccessDenied();
  }, [denied, onAccessDenied]);

  return (
    <div className="mb-5 min-w-0 border-b border-hairline pb-4">
      <Button
        aria-controls={historyId}
        aria-expanded={open}
        icon={<History aria-hidden="true" className="h-3.5 w-3.5" />}
        onClick={() => setOpen((value) => !value)}
        size="sm"
        variant="ghost"
      >
        {t("Version history")}
      </Button>
      {open && (
        <section
          id={historyId}
          aria-label={t("Summary version history")}
          className="mt-2"
        >
          {query.isPending || checking ? (
            <p role="status" className="text-xs leading-5 text-ink-tertiary">
              {t("Loading versions…")}
            </p>
          ) : denied ? (
            <p role="alert" className="text-xs leading-5 text-warning">
              {t("This history is no longer available to you.")}
            </p>
          ) : (
            <>
              <ul className="min-w-0 divide-y divide-hairline">
                {items.map((item) => (
                  <li key={item.revision}>
                    <Button
                      aria-label={t("Read version {value1}", {
                        value1: item.revision,
                      })}
                      aria-current={
                        item.revision === selectedRevision ? "page" : undefined
                      }
                      className="my-1 w-full min-w-0 justify-start text-left"
                      onClick={() =>
                        onSelect({ id: summaryId, revision: item.revision })
                      }
                      size="sm"
                      variant="ghost"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        v{item.revision} · {item.title || t("Untitled summary")}
                      </span>
                      <time
                        className="shrink-0 text-xs text-ink-tertiary"
                        dateTime={item.created_at}
                      >
                        {summaryDate(item.created_at, locale)}
                      </time>
                    </Button>
                  </li>
                ))}
              </ul>
              {!query.isError && !items.length && (
                <p className="text-xs leading-5 text-ink-tertiary">
                  {t("No readable versions in this page.")}
                </p>
              )}
              {query.isError && (
                <div role="alert" className="text-xs leading-5 text-warning">
                  <p>
                    {expired
                      ? t(
                          "This history has changed. Reload versions to start again.",
                        )
                      : t("Could not load versions. Please try again.")}
                  </p>
                  <Button
                    className="mt-2"
                    onClick={() => {
                      void query.restart();
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {t("Reload versions")}
                  </Button>
                </div>
              )}
              {query.hasNextPage && !query.isError && (
                <Button
                  className="mt-2"
                  disabled={query.isFetchingNextPage}
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {query.isFetchingNextPage
                    ? t("Loading more versions…")
                    : t("Load more versions")}
                </Button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
