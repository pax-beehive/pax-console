"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SearchSourcePanel,
  SummaryContent,
} from "@/components/search/search-source-panel";
import {
  useSecretarySummary,
  type SecretarySummarySelection,
} from "@/features/api/secretary-summaries";
import { ApiError } from "@/features/api/errors";
import type { WorkspaceSearchRef } from "@/features/api/workspace-search";
import { SecretarySummaryHistory } from "./secretary-summary-history";
import { isSummaryAccessDenied, summaryDate } from "./secretary-summary-format";

export function SecretarySummaryDetail({
  userId,
  selection,
  onClose,
  onSelect,
  onAccessDenied,
}: {
  userId: string;
  selection: SecretarySummarySelection;
  onClose: () => void;
  onSelect: (selection: SecretarySummarySelection) => void;
  onAccessDenied: () => void;
}) {
  const query = useSecretarySummary(userId, selection);
  const denied = isSummaryAccessDenied(query.error);
  const checking = query.isFetching && !query.isFetchedAfterMount;
  const summary = query.isError || checking ? undefined : query.data;
  const [sourceRef, setSourceRef] = useState<WorkspaceSearchRef>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!sourceRef) heading.current?.focus();
  }, [sourceRef]);
  useEffect(() => {
    if (denied) onAccessDenied();
  }, [denied, onAccessDenied]);
  const unavailable =
    query.error instanceof ApiError && [404, 409].includes(query.error.status);

  function selectSource(ref: WorkspaceSearchRef) {
    if (ref.kind === "summary")
      onSelect({ id: ref.id, revision: ref.revision });
    else setSourceRef(ref);
  }

  return (
    <section
      aria-label="Summary details"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div
        hidden={Boolean(sourceRef && summary)}
        className={`min-h-0 min-w-0 flex-1 flex-col ${sourceRef && summary ? "hidden" : "flex"}`}
      >
        <header className="shrink-0 border-b border-hairline px-4 py-3 sm:px-6">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
            onClick={onClose}
          >
            Back to summaries
          </Button>
          <h2
            ref={heading}
            tabIndex={-1}
            className="mt-3 break-words text-base font-semibold leading-7 text-ink outline-none [overflow-wrap:anywhere]"
          >
            {summary?.title || "Summary"}
          </h2>
          {summary && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-ink-tertiary">
              <span>Version {summary.revision}</span>
              {summary.node_status === "stale" && (
                <Badge tone="warning">Awaiting update</Badge>
              )}
              <span>
                Updated{" "}
                <time dateTime={summary.created_at}>
                  {summaryDate(summary.created_at)}
                </time>
              </span>
            </div>
          )}
          {summary && (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              {summary.origin_session_id && (
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={`/?session_id=${encodeURIComponent(summary.origin_session_id)}`}
                  >
                    {summary.origin_session_title || "Open origin session"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </header>
        <div
          data-viewport-scroll
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 [overflow-wrap:anywhere]"
        >
          {query.isPending || checking ? (
            <p role="status" className="text-sm text-ink-tertiary">
              Loading summary…
            </p>
          ) : query.isError ? (
            <div role="alert" className="text-sm leading-6 text-ink-muted">
              <p>
                {denied
                  ? "This summary is no longer available to you."
                  : unavailable
                    ? "This summary or its requested version is unavailable. Its sources may have been deleted or become inaccessible."
                    : "Could not load this summary. Please try again."}
              </p>
              {!denied && !unavailable && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  Retry summary
                </Button>
              )}
            </div>
          ) : (
            summary && (
              <div className="mx-auto min-w-0 max-w-3xl">
                <SecretarySummaryHistory
                  userId={userId}
                  summaryId={summary.summary_id}
                  selectedRevision={summary.revision}
                  onSelect={onSelect}
                  onAccessDenied={onAccessDenied}
                />
                {summary.node_status === "empty" && (
                  <p
                    role="status"
                    className="mb-4 text-sm leading-6 text-ink-tertiary"
                  >
                    No retained content in this version. Earlier versions remain
                    subject to current source permissions.
                  </p>
                )}
                <SummaryContent
                  summary={summary}
                  onSelect={selectSource}
                  markdown
                />
              </div>
            )
          )}
        </div>
      </div>
      {sourceRef && summary && (
        <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-canvas">
          <SearchSourcePanel
            key={JSON.stringify(sourceRef)}
            userId={userId}
            sourceRef={sourceRef}
            onSelect={selectSource}
            onClose={() => setSourceRef(undefined)}
            onAccessDenied={onAccessDenied}
            revalidateOnMount
          />
        </div>
      )}
    </section>
  );
}
