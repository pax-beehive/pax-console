"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId } from "@/components/ui/text";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  isWorkspaceMessageRead,
  isWorkspaceSummaryVersion,
  useWorkspaceSource,
  WorkspaceMessageRead,
  WorkspaceMessageVersionRef,
  WorkspaceReadRequest,
  WorkspaceSearchRef,
  WorkspaceSessionRead,
  WorkspaceSourceRead,
  WorkspaceSummaryVersion,
} from "@/features/api/workspace-search";

export function messageSourceRef(
  ref: WorkspaceMessageVersionRef,
): WorkspaceSearchRef {
  return {
    kind: "message",
    id: ref.message_id,
    content_hash: ref.content_hash,
    canonicalization_version: ref.canonicalization_version,
  };
}

export function SearchSourcePanel({
  userId,
  sourceRef,
  title,
  onSelect,
  onClose,
  onAccessDenied,
}: {
  userId: string;
  sourceRef: WorkspaceSearchRef;
  title?: string;
  onSelect: (ref: WorkspaceSearchRef) => void;
  onClose: () => void;
  onAccessDenied?: () => void;
}) {
  const [request, setRequest] = useState<WorkspaceReadRequest>({
    ref: sourceRef,
    limit: 4096,
    ...(sourceRef.kind === "message" ? { before: 3, after: 3 } : {}),
  });
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const source = useWorkspaceSource(userId, request);
  const accessDenied =
    source.error instanceof AuthError ||
    (source.error instanceof ApiError &&
      [401, 403].includes(source.error.status));
  useEffect(() => {
    if (accessDenied) onAccessDenied?.();
  }, [accessDenied, onAccessDenied]);
  const data = source.isError ? undefined : source.data;
  const changed =
    source.error instanceof ApiError && source.error.status === 409;
  const unavailable =
    source.error instanceof ApiError &&
    [403, 404].includes(source.error.status);
  const message = data && isWorkspaceMessageRead(data) ? data : undefined;
  const summary = data && isWorkspaceSummaryVersion(data) ? data : undefined;
  const session = data && isSessionSource(data) ? data : undefined;
  const heading =
    summary?.title ||
    session?.title ||
    (!source.isError && title) ||
    (sourceRef.kind === "message"
      ? "Message"
      : sourceRef.kind === "summary"
        ? "Summary"
        : "Session");
  const sessionId = message?.session_id ?? session?.session_id;

  function readPage(
    offset: number,
    ref: WorkspaceSearchRef,
    view: WorkspaceReadRequest["view"],
  ) {
    setRequest((current) => ({ ...current, ref, view, offset }));
  }

  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              {message?.role ||
                (sourceRef.kind === "session"
                  ? "Session"
                  : sourceRef.kind === "summary"
                    ? "Summary"
                    : "Message")}
            </Badge>
            {summary && <Badge>Version {summary.revision}</Badge>}
          </div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 break-words text-sm font-semibold text-ink outline-none [overflow-wrap:anywhere]"
          >
            {heading}
          </h2>
          {(message?.created_at ||
            summary?.created_at ||
            session?.created_at) && (
            <p className="mt-1 text-xs text-ink-tertiary">
              {formatSourceDate(
                message?.created_at ||
                  summary?.created_at ||
                  session?.created_at,
              )}
            </p>
          )}
        </div>
        <Button
          aria-label="Close source"
          icon={<X aria-hidden="true" className="h-4 w-4" />}
          onClick={onClose}
          size="icon"
          tooltip="Close source"
          variant="ghost"
        />
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 [overflow-wrap:anywhere]">
        {source.isPending ? (
          <p className="text-sm text-ink-tertiary" role="status">
            Loading source…
          </p>
        ) : source.isError ? (
          <div className="rounded-md border border-warning/30 p-3" role="alert">
            <p className="text-sm leading-6 text-ink-muted">
              {changed
                ? "This version is no longer available. The source may have changed since it was found."
                : unavailable
                  ? "This source was removed or is no longer available to you."
                  : "Could not load this source. Please try again."}
            </p>
            {changed ? (
              <Button
                className="mt-3"
                onClick={() => {
                  setPreviousOffsets([]);
                  setRequest({
                    ref: { kind: sourceRef.kind, id: sourceRef.id },
                    limit: 4096,
                    ...(sourceRef.kind === "message"
                      ? { before: 3, after: 3 }
                      : {}),
                  });
                }}
                size="sm"
              >
                Load current version
              </Button>
            ) : (
              !unavailable && (
                <Button
                  className="mt-3"
                  onClick={() => {
                    void source.refetch();
                  }}
                  size="sm"
                >
                  Retry source
                </Button>
              )
            )}
          </div>
        ) : (
          <>
            {sessionId && (
              <Button
                asChild
                className="mb-4"
                icon={
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                }
                size="sm"
              >
                <Link href={`/?session_id=${encodeURIComponent(sessionId)}`}>
                  Open session
                </Link>
              </Button>
            )}
            {message && (
              <>
                <div
                  className="mb-4 flex flex-wrap items-center gap-1"
                  aria-label="Message view"
                >
                  {message.available_views.map((view) => (
                    <Button
                      key={view}
                      aria-pressed={message.view === view}
                      onClick={() => {
                        setPreviousOffsets([]);
                        readPage(0, message.ref, view);
                      }}
                      size="sm"
                      variant={message.view === view ? "secondary" : "ghost"}
                    >
                      {view === "first"
                        ? "First paragraph"
                        : view === "last"
                          ? "Last paragraph"
                          : "Full message"}
                    </Button>
                  ))}
                </div>
                {message.context
                  ?.filter((item) => item.session_seq < message.session_seq)
                  .map((item) => (
                    <ContextMessage
                      key={item.message_id}
                      message={item}
                      onSelect={onSelect}
                    />
                  ))}
                <article
                  aria-label="Message text"
                  className="border-l-2 border-accent pl-3"
                >
                  <p className="whitespace-pre-wrap text-sm leading-7 text-ink">
                    {message.text}
                  </p>
                </article>
                {(previousOffsets.length > 0 || message.has_more) && (
                  <nav
                    aria-label="Message pages"
                    className="my-4 flex flex-wrap items-center gap-2"
                  >
                    <Button
                      disabled={!previousOffsets.length}
                      onClick={() => {
                        const offsets = [...previousOffsets];
                        const previous = offsets.pop() ?? 0;
                        setPreviousOffsets(offsets);
                        readPage(previous, message.ref, message.view);
                      }}
                      size="sm"
                    >
                      Previous page
                    </Button>
                    {message.has_more && message.next_offset !== undefined && (
                      <Button
                        onClick={() => {
                          setPreviousOffsets((current) => [
                            ...current,
                            request.offset ?? 0,
                          ]);
                          readPage(
                            message.next_offset as number,
                            message.ref,
                            message.view,
                          );
                        }}
                        size="sm"
                      >
                        Next page
                      </Button>
                    )}
                    <span className="text-xs text-ink-tertiary">
                      Page {previousOffsets.length + 1}
                    </span>
                  </nav>
                )}
                {message.context
                  ?.filter((item) => item.session_seq > message.session_seq)
                  .map((item) => (
                    <ContextMessage
                      key={item.message_id}
                      message={item}
                      onSelect={onSelect}
                    />
                  ))}
                <details className="mt-5 text-xs text-ink-tertiary">
                  <summary className="cursor-pointer">Source details</summary>
                  <div className="mt-2 space-y-2">
                    <MonoId>{message.message_id}</MonoId>
                    <MonoId>{message.session_id}</MonoId>
                    {message.ref.content_hash && (
                      <MonoId>{message.ref.content_hash}</MonoId>
                    )}
                  </div>
                </details>
              </>
            )}
            {summary && (
              <SummaryContent summary={summary} onSelect={onSelect} />
            )}
            {session && (
              <p className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">
                {session.body || "Open this session to read its messages."}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ContextMessage({
  message,
  onSelect,
}: {
  message: WorkspaceMessageRead;
  onSelect: (ref: WorkspaceSearchRef) => void;
}) {
  return (
    <article
      aria-label="Context message"
      className="my-4 border-l border-hairline pl-3"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-tertiary">{message.role}</span>
        <Button onClick={() => onSelect(message.ref)} size="sm" variant="ghost">
          Read message
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-6 text-ink-muted">
        {message.text}
      </p>
      {message.has_more && (
        <p className="text-xs text-ink-tertiary">More in this message</p>
      )}
    </article>
  );
}

export function SummaryContent({
  summary,
  onSelect,
}: {
  summary: WorkspaceSummaryVersion;
  onSelect: (ref: WorkspaceSearchRef) => void;
}) {
  return (
    <>
      <article aria-label="Summary text">
        <p className="whitespace-pre-wrap text-sm leading-7 text-ink">
          {summary.body}
        </p>
      </article>
      {!!summary.claims?.length && (
        <section
          aria-label="Summary claims"
          className="mt-6 border-t border-hairline pt-4"
        >
          <h3 className="text-xs font-semibold text-ink-subtle">Claims</h3>
          <ul className="mt-2 space-y-4">
            {summary.claims.map((claim) => (
              <li key={claim.id}>
                <div className="flex flex-wrap items-center gap-2">
                  {claim.state && <Badge>{claim.state}</Badge>}
                  <p className="text-sm leading-6 text-ink-muted">
                    {claim.text}
                  </p>
                </div>
                {claim.evidence?.map((evidence, index) => (
                  <div
                    key={index}
                    className="mt-2 border-l border-hairline pl-3"
                  >
                    <blockquote className="whitespace-pre-wrap text-xs leading-6 text-ink-muted">
                      {evidence.quote}
                    </blockquote>
                    <Button
                      onClick={() =>
                        onSelect(messageSourceRef(evidence.message))
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Read evidence
                    </Button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section
        aria-label="Summary sources"
        className="mt-6 border-t border-hairline pt-4"
      >
        <h3 className="text-xs font-semibold text-ink-subtle">
          Source messages{" "}
          <span className="font-normal text-ink-tertiary">
            ({summary.coverage.length})
          </span>
        </h3>
        <p className="mt-1 text-xs leading-5 text-ink-tertiary">
          Read the exact message versions used for this summary.
        </p>
        <ul className="mt-2 divide-y divide-hairline">
          {summary.coverage.map((ref) => (
            <li key={`${ref.message_id}:${ref.content_hash}`}>
              <Button
                className="my-1 w-full justify-start"
                onClick={() => onSelect(messageSourceRef(ref))}
                size="sm"
                variant="ghost"
              >
                <MonoId>{ref.message_id}</MonoId>
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {!!summary.summary_sources?.length && (
        <section
          aria-label="Related summaries"
          className="mt-6 border-t border-hairline pt-4"
        >
          <h3 className="text-xs font-semibold text-ink-subtle">
            Source summaries
          </h3>
          <ul className="mt-2 divide-y divide-hairline">
            {summary.summary_sources.map((ref) => (
              <li key={`${ref.summary_id}:${ref.revision}`}>
                <Button
                  aria-label={`Open summary ${ref.summary_id}, version ${ref.revision}`}
                  className="my-1 w-full justify-start"
                  onClick={() =>
                    onSelect({
                      kind: "summary",
                      id: ref.summary_id,
                      revision: ref.revision,
                    })
                  }
                  size="sm"
                  variant="ghost"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MonoId>{ref.summary_id}</MonoId>
                    <span className="shrink-0 text-xs">v{ref.revision}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function formatSourceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function isSessionSource(
  source: WorkspaceSourceRead,
): source is WorkspaceSessionRead {
  return "kind" in source && source.kind === "session";
}
