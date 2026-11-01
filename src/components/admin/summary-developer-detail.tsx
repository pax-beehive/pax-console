"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonoId } from "@/components/ui/text";
import {
  SearchSourcePanel,
  SummaryContent,
} from "@/components/search/search-source-panel";
import {
  useDeveloperSummary,
  type DeveloperSummarySelection,
} from "@/features/api/developer-summaries";
import { ApiError, AuthError } from "@/features/api/errors";
import type { WorkspaceSearchRef } from "@/features/api/workspace-search";

export function SummaryDeveloperDetail({
  userId,
  selection,
  onClose,
  onSelect,
  onAccessDenied,
}: {
  userId: string;
  selection: DeveloperSummarySelection;
  onClose: () => void;
  onSelect: (selection: DeveloperSummarySelection) => void;
  onAccessDenied: () => void;
}) {
  const query = useDeveloperSummary(userId, selection);
  const summary = query.isError ? undefined : query.data?.summary;
  const [sourceRef, setSourceRef] = useState<WorkspaceSearchRef>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const denied =
    query.error instanceof AuthError ||
    (query.error instanceof ApiError &&
      [401, 403].includes(query.error.status));
  useEffect(() => {
    if (denied) onAccessDenied();
  }, [denied, onAccessDenied]);
  const unavailable =
    query.error instanceof ApiError && [404, 409].includes(query.error.status);

  function selectSource(ref: WorkspaceSearchRef) {
    if (ref.kind === "summary") {
      onSelect({ id: ref.id, revision: ref.revision });
    } else {
      setSourceRef(ref);
    }
  }

  return (
    <section
      aria-label="Summary details"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {sourceRef && summary ? (
        <SearchSourcePanel
          key={JSON.stringify(sourceRef)}
          userId={userId}
          sourceRef={sourceRef}
          onSelect={selectSource}
          onClose={() => setSourceRef(undefined)}
          onAccessDenied={onAccessDenied}
        />
      ) : (
        <>
          <header className="shrink-0 border-b border-hairline px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                icon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
                size="sm"
                variant="ghost"
                onClick={onClose}
              >
                Back to summaries
              </Button>
              {summary && (
                <span className="text-xs text-ink-tertiary">
                  Version {summary.revision}
                </span>
              )}
            </div>
            <h2
              ref={heading}
              tabIndex={-1}
              className="mt-3 break-words text-base font-semibold text-ink outline-none [overflow-wrap:anywhere]"
            >
              {summary?.title || "Summary"}
            </h2>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 [overflow-wrap:anywhere]">
            {query.isPending ? (
              <p role="status" className="text-sm text-ink-tertiary">
                Loading summary…
              </p>
            ) : query.isError ? (
              <div role="alert" className="text-sm leading-6 text-ink-muted">
                <p>
                  {denied
                    ? "Access denied. This summary is no longer available to you."
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
                <>
                  <dl className="mb-5 grid min-w-0 gap-3 border-b border-hairline pb-5 text-xs sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-ink-tertiary">Summary ID</dt>
                      <dd className="mt-1">
                        <MonoId>{summary.summary_id}</MonoId>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-ink-tertiary">Created</dt>
                      <dd className="mt-1 text-ink-muted">
                        {new Date(summary.created_at).toLocaleString()}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-ink-tertiary">
                        Subject · {summary.subject_type}
                      </dt>
                      <dd className="mt-1 break-all text-ink-muted">
                        {summary.subject_id}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-ink-tertiary">Owner</dt>
                      <dd className="mt-1">
                        <MonoId>{summary.owner_user_id}</MonoId>
                      </dd>
                    </div>
                  </dl>
                  <SummaryContent summary={summary} onSelect={selectSource} />
                  <details className="mt-6 border-t border-hairline pt-4">
                    <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                      Raw JSON
                    </summary>
                    <pre
                      aria-label="Summary JSON"
                      className="mt-3 max-w-full overflow-x-auto rounded-md bg-surface-1 p-3 text-xs leading-6 text-ink-muted"
                    >
                      {JSON.stringify(summary, null, 2)}
                    </pre>
                  </details>
                </>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}
