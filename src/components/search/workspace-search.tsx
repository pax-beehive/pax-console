"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { ApiError, AuthError } from "@/features/api/errors";
import { LOGIN_URL } from "@/features/api/client";
import {
  WorkspaceSearchKind,
  WorkspaceSearchRef,
} from "@/features/api/workspace-search";
import { useWorkspaceSearchGroups } from "@/features/api/workspace-search-groups";
import { SearchGroupCard } from "./search-group-card";
import { SearchSourcePanel } from "./search-source-panel";

export type SearchKindFilter = "all" | WorkspaceSearchKind;
const kinds: SearchKindFilter[] = ["all", "session", "message", "summary"];
const labels: Record<SearchKindFilter, string> = {
  all: "All",
  session: "Titles",
  message: "Messages",
  summary: "Summaries",
};
const singularLabels: Record<WorkspaceSearchKind, string> = {
  session: "Title",
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
  const [readers, setReaders] = useState<
    {
      key: number;
      ref: WorkspaceSearchRef;
      title?: string;
    }[]
  >([]);
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const [groupAccessDenied, setGroupAccessDenied] = useState(false);
  const denyAccess = useCallback(() => setGroupAccessDenied(true), []);
  const readerSequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const selected = readers.at(-1);
  const queryTooLong = Array.from(query).length > 256;
  const filters = {
    query: queryTooLong ? "" : query,
    kinds: kind === "all" ? undefined : [kind],
    limit: 20,
  };
  const search = useWorkspaceSearchGroups(userId, filters);
  const checking = search.isFetching && !search.isFetchedAfterMount;
  const authorizationDenied =
    groupAccessDenied ||
    (search.isError &&
      (search.error instanceof AuthError ||
        (search.error instanceof ApiError &&
          [401, 403].includes(search.error.status))));
  const seen = new Set<string>();
  const groups = (
    authorizationDenied || checking
      ? []
      : (search.data?.pages.flatMap((page) => page.groups) ?? [])
  ).filter((group) => {
    if (seen.has(group.key)) return false;
    seen.add(group.key);
    return true;
  });
  const expiredCursor =
    search.error instanceof ApiError && /cursor/i.test(search.error.message);
  const invalidInput =
    search.error instanceof ApiError && search.error.status === 400;
  function restart() {
    setReaders([]);
    setSelectedGroup(undefined);
    setGroupAccessDenied(false);
    void search.restart();
  }
  function closeReaders() {
    setReaders([]);
  }
  useEffect(() => {
    if (!readers.length) returnFocus.current?.focus({ preventScroll: true });
  }, [readers.length]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() === query) {
      restart();
      return;
    }
    onNavigate(searchHref(draft, kind));
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") closeReaders();
      }}
    >
      <header
        className={`${selected && !authorizationDenied ? "hidden md:block" : ""} shrink-0 border-b border-hairline px-4 pb-3 pt-4 sm:px-5`}
      >
        <h1 className="text-base font-semibold text-ink">Search</h1>
        <p className="mt-1 hidden text-xs text-ink-tertiary md:block">
          Results grouped by session. Best matches first.
        </p>
        <form
          aria-label="Workspace search"
          className="mt-3 flex min-w-0 gap-2"
          onSubmit={submit}
        >
          <SearchBox
            aria-label="Search your workspace"
            className="min-h-11 flex-1 md:min-h-9"
            maxLength={512}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search titles and content"
            value={draft}
          />
          <Button
            className="min-h-11 md:min-h-9"
            disabled={!draft.trim()}
            icon={<Search aria-hidden="true" className="h-4 w-4" />}
            type="submit"
            variant="primary"
          >
            Search
          </Button>
        </form>
        <p className="mt-2 hidden text-xs text-ink-tertiary md:block">
          Up to 16 distinct terms, separated by spaces. Order doesn&apos;t
          matter.
        </p>
        <nav
          aria-label="Search result type"
          className="mt-3 flex gap-1 overflow-x-auto"
        >
          {kinds.map((value) => (
            <Button
              key={value}
              aria-pressed={kind === value}
              onClick={() => onNavigate(searchHref(query, value))}
              className="min-h-11 md:min-h-8"
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
              text="Separate keywords with spaces. All-keyword results come first, followed by partial matches."
            />
          ) : search.isPending || checking ? (
            <SearchNotice title="Searching…" loading />
          ) : (
            <>
              <div
                aria-live="polite"
                className="border-b border-hairline px-4 py-2 text-xs text-ink-tertiary"
              >
                {groups.length} {groups.length === 1 ? "result" : "results"}
                {search.hasNextPage ? " loaded" : ""}
              </div>
              {!groups.length && !search.isError && !authorizationDenied && (
                <SearchNotice
                  title={
                    search.hasNextPage
                      ? "No visible matches in this page"
                      : "No results"
                  }
                  text={
                    search.hasNextPage
                      ? "Load more to continue searching."
                      : "Try a shorter phrase or a different result type."
                  }
                />
              )}
              <ul className="min-w-0 divide-y divide-hairline">
                {groups.map((group) => (
                  <li key={group.key}>
                    <SearchGroupCard
                      group={group}
                      userId={userId}
                      filters={filters}
                      active={Boolean(selected && selectedGroup === group.key)}
                      selectedRef={readers[0]?.ref}
                      onAccessDenied={denyAccess}
                      onSelect={(hit, trigger) => {
                        returnFocus.current = trigger;
                        setSelectedGroup(group.key);
                        setReaders([
                          {
                            key: ++readerSequence.current,
                            ref: hit.ref,
                            title: hit.title,
                          },
                        ]);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {(search.isError || authorizationDenied) && (
                <div
                  className="m-4 rounded-md border border-warning/30 p-3"
                  role="alert"
                >
                  <p className="text-sm text-ink-muted">
                    {authorizationDenied
                      ? "Your session expired. Sign in again to search your workspace."
                      : expiredCursor
                        ? "These results have expired. Start the search again to continue."
                        : invalidInput
                          ? "Use up to 16 distinct terms and 256 characters."
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
                        restart();
                      }}
                      size="sm"
                    >
                      {expiredCursor ? "Restart search" : "Retry search"}
                    </Button>
                  )}
                </div>
              )}
              {search.hasNextPage &&
                !search.isError &&
                !authorizationDenied && (
                  <div className="p-4">
                    <Button
                      className="w-full justify-center"
                      disabled={search.isFetchingNextPage}
                      onClick={() => {
                        void search.fetchNextPage();
                      }}
                    >
                      {search.isFetchingNextPage
                        ? "Loading more…"
                        : "Load more"}
                    </Button>
                  </div>
                )}
              {!authorizationDenied &&
                search.data?.pages.at(-1)?.pagination_limited && (
                  <p className="px-4 py-3 text-xs text-ink-tertiary">
                    Narrow your search to see more results.
                  </p>
                )}
            </>
          )}
        </section>
        {selected && !authorizationDenied ? (
          <section
            aria-label="Selected source"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b border-hairline px-3 py-1">
              <Button
                className="min-h-11 md:min-h-8"
                icon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setReaders((current) => current.slice(0, -1))}
                size="sm"
                variant="ghost"
              >
                {readers.length > 1
                  ? `Back to ${singularLabels[readers[readers.length - 2].ref.kind].toLowerCase()}`
                  : "Back to results"}
              </Button>
            </div>
            {readers.map((reader, index) => {
              const active = index === readers.length - 1;
              return (
                <div
                  key={reader.key}
                  aria-hidden={!active}
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  style={active ? undefined : { display: "none" }}
                >
                  <SearchSourcePanel
                    active={active}
                    revalidateOnMount
                    onAccessDenied={denyAccess}
                    userId={userId}
                    sourceRef={reader.ref}
                    title={reader.title}
                    onSelect={(ref) => {
                      const next = { key: ++readerSequence.current, ref };
                      setReaders((current) => [...current, next]);
                    }}
                    onClose={closeReaders}
                  />
                </div>
              );
            })}
          </section>
        ) : query && groups.length > 0 ? (
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
