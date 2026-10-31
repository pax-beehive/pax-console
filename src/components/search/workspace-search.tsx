"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, MessageSquare, Search } from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { MonoId } from "@/components/ui/text";
import { ApiError, AuthError } from "@/features/api/errors";
import { LOGIN_URL } from "@/features/api/client";
import {
  useWorkspaceSearch,
  WorkspaceSearchKind,
  WorkspaceSearchRef,
} from "@/features/api/workspace-search";
import { LiteralHighlight } from "./literal-highlight";
import { SearchSourcePanel } from "./search-source-panel";

export type SearchKindFilter = "all" | WorkspaceSearchKind;
const kinds: SearchKindFilter[] = ["all", "session", "message", "summary"];
const labels: Record<SearchKindFilter, string> = {
  all: "All",
  session: "Sessions",
  message: "Messages",
  summary: "Summaries",
};
const singularLabels: Record<WorkspaceSearchKind, string> = {
  session: "Session",
  message: "Message",
  summary: "Summary",
};

export function searchHref(query: string, kind: SearchKindFilter) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (kind !== "all") params.set("kind", kind);
  return `/search${params.size ? `?${params}` : ""}`;
}

export function searchRefKey(ref: WorkspaceSearchRef) {
  return JSON.stringify([
    ref.kind,
    ref.id,
    ref.revision,
    ref.content_hash,
    ref.canonicalization_version,
  ]);
}

export function WorkspaceSearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const query = (params.get("q") ?? "").trim();
  const rawKind = params.get("kind");
  const kind = kinds.includes(rawKind as SearchKindFilter)
    ? (rawKind as SearchKindFilter)
    : "all";
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <WorkspaceSearch
            key={`${user.user_id}:${query}:${kind}`}
            userId={user.user_id}
            query={query}
            kind={kind}
            onNavigate={(href) => router.push(href)}
          />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function WorkspaceSearch({
  userId,
  query,
  kind,
  onNavigate,
}: {
  userId: string;
  query: string;
  kind: SearchKindFilter;
  onNavigate: (href: string) => void;
}) {
  return (
    <WorkspaceSearchContent
      key={`${userId}:${query}:${kind}`}
      userId={userId}
      query={query}
      kind={kind}
      onNavigate={onNavigate}
    />
  );
}

function WorkspaceSearchContent({
  userId,
  query,
  kind,
  onNavigate,
}: {
  userId: string;
  query: string;
  kind: SearchKindFilter;
  onNavigate: (href: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [selected, setSelected] = useState<{
    ref: WorkspaceSearchRef;
    title?: string;
  }>();
  const queryTooLong = Array.from(query).length > 256;
  const search = useWorkspaceSearch(userId, {
    query: queryTooLong ? "" : query,
    kinds: kind === "all" ? undefined : [kind],
    limit: 20,
  });
  const authorizationDenied =
    search.isError && search.error instanceof AuthError;
  const seen = new Set<string>();
  const hits = (
    authorizationDenied
      ? []
      : (search.data?.pages.flatMap((page) => page.hits) ?? [])
  ).filter((hit) => {
    const key = searchRefKey(hit.ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const expiredCursor =
    search.error instanceof ApiError && /cursor/i.test(search.error.message);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() === query) {
      void search.restart();
      return;
    }
    onNavigate(searchHref(draft, kind));
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelected(undefined);
      }}
    >
      <header className="shrink-0 border-b border-hairline px-4 pb-3 pt-4 sm:px-5">
        <h1 className="text-base font-semibold text-ink">Search</h1>
        <p className="mt-1 text-xs text-ink-tertiary">
          Find messages, session titles, and summaries in your workspace.
        </p>
        <form
          aria-label="Workspace search"
          className="mt-3 flex min-w-0 gap-2"
          onSubmit={submit}
        >
          <SearchBox
            aria-label="Search your workspace"
            className="min-h-9 flex-1"
            maxLength={512}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search titles and content"
            value={draft}
          />
          <Button
            disabled={!draft.trim()}
            icon={<Search aria-hidden="true" className="h-4 w-4" />}
            type="submit"
            variant="primary"
          >
            Search
          </Button>
        </form>
        <nav
          aria-label="Search result type"
          className="mt-3 flex gap-1 overflow-x-auto"
        >
          {kinds.map((value) => (
            <Button
              key={value}
              aria-pressed={kind === value}
              onClick={() => onNavigate(searchHref(query, value))}
              size="sm"
              variant={kind === value ? "secondary" : "ghost"}
            >
              {labels[value]}
            </Button>
          ))}
        </nav>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section
          aria-label="Search results"
          className={`${selected && !authorizationDenied ? "hidden md:flex md:w-[42%] md:shrink-0" : "flex w-full"} min-h-0 min-w-0 flex-col overflow-y-auto md:border-r md:border-hairline`}
        >
          {queryTooLong ? (
            <SearchNotice
              title="Search phrase is too long"
              text="Use a phrase with 256 characters or fewer."
            />
          ) : !query ? (
            <SearchNotice
              title="Search your workspace"
              text="Enter a word or phrase to find its exact text in your content."
            />
          ) : search.isPending ? (
            <SearchNotice title="Searching…" loading />
          ) : (
            <>
              <div
                aria-live="polite"
                className="border-b border-hairline px-4 py-2 text-xs text-ink-tertiary"
              >
                {hits.length} {hits.length === 1 ? "result" : "results"}
                {search.hasNextPage ? " loaded" : ""}
              </div>
              {!hits.length && !search.isError && (
                <SearchNotice
                  title="No results"
                  text="Try a shorter phrase or a different result type."
                />
              )}
              <ul className="min-w-0 divide-y divide-hairline">
                {hits.map((hit) => {
                  const active =
                    selected &&
                    searchRefKey(selected.ref) === searchRefKey(hit.ref);
                  return (
                    <li key={searchRefKey(hit.ref)}>
                      <button
                        aria-pressed={Boolean(active)}
                        className={`block w-full min-w-0 px-4 py-3 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-surface-2" : ""}`}
                        onClick={() =>
                          setSelected({ ref: hit.ref, title: hit.title })
                        }
                        type="button"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge>{singularLabels[hit.ref.kind]}</Badge>
                          <span className="min-w-0 truncate text-sm font-medium text-ink">
                            <LiteralHighlight
                              text={
                                hit.title ||
                                (hit.ref.kind === "message"
                                  ? "Message"
                                  : "Untitled")
                              }
                              query={query}
                            />
                          </span>
                          {hit.ref.kind === "summary" && (
                            <span className="shrink-0 text-xs text-ink-tertiary">
                              v{hit.ref.revision}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-ink-muted [overflow-wrap:anywhere]">
                          <LiteralHighlight text={hit.snippet} query={query} />
                        </p>
                        {hit.session_id && (
                          <div className="mt-2 flex min-w-0 items-center gap-1">
                            <MessageSquare
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 text-ink-tertiary"
                            />
                            <MonoId>{hit.session_id}</MonoId>
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {search.isError && (
                <div
                  className="m-4 rounded-md border border-warning/30 p-3"
                  role="alert"
                >
                  <p className="text-sm text-ink-muted">
                    {authorizationDenied
                      ? "Your session expired. Sign in again to search your workspace."
                      : expiredCursor
                        ? "These results have expired. Start the search again to continue."
                        : "Search is unavailable right now. Please try again."}
                  </p>
                  {authorizationDenied ? (
                    <Button asChild className="mt-2" size="sm">
                      <a href={LOGIN_URL}>Sign in again</a>
                    </Button>
                  ) : (
                    <Button
                      className="mt-2"
                      onClick={() => {
                        void search.restart();
                      }}
                      size="sm"
                    >
                      {expiredCursor ? "Restart search" : "Retry search"}
                    </Button>
                  )}
                </div>
              )}
              {search.hasNextPage && !search.isError && (
                <div className="p-4">
                  <Button
                    className="w-full justify-center"
                    disabled={search.isFetchingNextPage}
                    onClick={() => {
                      void search.fetchNextPage();
                    }}
                  >
                    {search.isFetchingNextPage ? "Loading more…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
        {selected && !authorizationDenied ? (
          <section
            aria-label="Selected source"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <div className="border-b border-hairline px-3 py-2 md:hidden">
              <Button
                icon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setSelected(undefined)}
                size="sm"
                variant="ghost"
              >
                Back to results
              </Button>
            </div>
            <SearchSourcePanel
              key={searchRefKey(selected.ref)}
              userId={userId}
              sourceRef={selected.ref}
              title={selected.title}
              onSelect={(ref) => setSelected({ ref })}
              onClose={() => setSelected(undefined)}
            />
          </section>
        ) : query && hits.length > 0 ? (
          <div className="hidden min-w-0 flex-1 items-center justify-center p-8 text-sm text-ink-tertiary md:flex">
            <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
            Select a result to read its source.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SearchNotice({
  title,
  text,
  loading,
}: {
  title: string;
  text?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="px-5 py-10 text-center"
      role={loading ? "status" : undefined}
    >
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {text && (
        <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-ink-tertiary">
          {text}
        </p>
      )}
    </div>
  );
}
