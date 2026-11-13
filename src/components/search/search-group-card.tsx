"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  WorkspaceSearchHit,
  WorkspaceSearchInput,
  WorkspaceSearchKind,
  WorkspaceSearchRef,
} from "@/features/api/workspace-search";
import {
  useWorkspaceGroupMatches,
  WorkspaceSearchGroup,
} from "@/features/api/workspace-search-groups";
import { LiteralHighlight } from "./literal-highlight";

const labels: Record<WorkspaceSearchKind, string> = {
  summary: "Summary",
  message: "Message",
  session: "Title",
};

function refKey(ref: WorkspaceSearchRef) {
  return JSON.stringify([
    ref.kind,
    ref.id,
    ref.revision,
    ref.content_hash,
    ref.canonicalization_version,
  ]);
}

export function SearchGroupCard({
  group,
  userId,
  filters,
  active,
  selectedRef,
  onSelect,
  onAccessDenied,
}: {
  group: WorkspaceSearchGroup;
  userId: string;
  filters: Omit<WorkspaceSearchInput, "cursor">;
  active: boolean;
  selectedRef?: WorkspaceSearchRef;
  onSelect: (hit: WorkspaceSearchHit, trigger: HTMLElement) => void;
  onAccessDenied: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [loadMatches, setLoadMatches] = useState(false);
  const matchesId = useId();
  const extra = useWorkspaceGroupMatches(
    userId,
    filters,
    group.key,
    expanded && loadMatches,
  );
  const checking = extra.isFetching && !extra.isFetchedAfterMount;
  const denied =
    loadMatches &&
    !checking &&
    (extra.error instanceof AuthError ||
      (extra.error instanceof ApiError &&
        [401, 403].includes(extra.error.status)));
  useEffect(() => {
    if (denied) onAccessDenied();
  }, [denied, onAccessDenied]);

  // The first expansion page repeats the initial preview matches. Keep their
  // exact version refs and never turn a candidate count into a result total.
  const seen = new Set<string>();
  const matches = [
    ...group.matches,
    ...(denied || checking || !loadMatches
      ? []
      : (extra.data?.pages.flatMap((page) => page.hits) ?? [])),
  ].filter((hit) => {
    const key = refKey(hit.ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const best = matches[0];
  const hasMore = loadMatches ? extra.hasNextPage : group.matches_has_more;
  const pending =
    extra.isPending || extra.isFetching || extra.isFetchingNextPage;
  const expiredCursor =
    extra.error instanceof ApiError && /cursor/i.test(extra.error.message);
  const title = group.title || group.session_id || best?.title || t("Untitled");

  if (!best) return null;

  return (
    <article aria-label={title} className="min-w-0">
      <div className={`relative min-w-0 ${active ? "bg-surface-2" : ""}`}>
        <Button
          asChild
          className="block min-h-12 w-full min-w-0 rounded-none border-0 px-4 py-3 text-left"
          tooltip={title}
          variant="ghost"
        >
          <button
            aria-label={t("Preview best match in {value1}", { value1: title })}
            aria-pressed={active}
            onClick={(event) => onSelect(best, event.currentTarget)}
            type="button"
          >
            <h2 className="truncate pr-14 text-sm font-medium text-ink">
              <LiteralHighlight text={title} query={filters.query} />
            </h2>
            {!expanded && (
              <p className="mt-1 line-clamp-2 whitespace-normal text-sm font-normal leading-6 text-ink-muted [overflow-wrap:anywhere]">
                <LiteralHighlight text={best.snippet} query={filters.query} />
              </p>
            )}
          </button>
        </Button>
        <Button
          aria-controls={matchesId}
          aria-expanded={expanded}
          aria-label={t("{value1} matches in {value2}", {
            value1: expanded ? t("Hide") : t("Show"),
            value2: title,
          })}
          className="absolute right-2 top-1 min-h-11 min-w-11 justify-center gap-1 px-1 text-xs"
          onClick={() => setExpanded((current) => !current)}
          size="sm"
          tooltip={`${matches.length} ${t(matches.length === 1 ? "match shown" : "matches shown")}`}
          variant="ghost"
        >
          <span className="inline-flex items-center gap-1">
            <span>{matches.length}</span>
            {expanded ? (
              <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </span>
        </Button>
      </div>
      <div id={matchesId} hidden={!expanded}>
        <ul className="min-w-0 divide-y divide-hairline border-t border-hairline">
          {matches.map((hit) => (
            <li key={refKey(hit.ref)}>
              <Button
                asChild
                className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-none border-0 px-4 py-2 text-left font-normal"
                tooltip={hit.snippet || hit.title || title}
                variant="ghost"
              >
                <button
                  aria-label={t("Preview {value1}: {value2}", {
                    value1: t(labels[hit.ref.kind]).toLowerCase(),
                    value2: hit.snippet || hit.title || title,
                  })}
                  aria-pressed={Boolean(
                    active &&
                    selectedRef &&
                    refKey(selectedRef) === refKey(hit.ref),
                  )}
                  onClick={(event) => onSelect(hit, event.currentTarget)}
                  type="button"
                >
                  <Badge className="border-0 py-0 font-medium">
                    {t(labels[hit.ref.kind])}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                    <LiteralHighlight
                      text={hit.snippet || hit.title || title}
                      query={filters.query}
                    />
                  </span>
                </button>
              </Button>
            </li>
          ))}
        </ul>
        {loadMatches && extra.isError && !checking && !denied ? (
          <div className="px-4 py-3" role="alert">
            <p className="text-xs text-ink-tertiary">
              {expiredCursor
                ? t(
                    "These matches have expired. Reload this session's matches.",
                  )
                : t("Could not load more matches. Please try again.")}
            </p>
            <Button
              className="mt-2 min-h-11"
              onClick={() => {
                if (expiredCursor) void extra.restart();
                else void extra.fetchNextPage();
              }}
              size="sm"
              variant="ghost"
            >
              {expiredCursor ? t("Reload matches") : t("Retry matches")}
            </Button>
          </div>
        ) : hasMore || (loadMatches && pending) ? (
          <Button
            aria-label={t("Load more matches in {value1}", { value1: title })}
            className="m-2 min-h-11"
            disabled={loadMatches && pending}
            onClick={() => {
              if (loadMatches) void extra.fetchNextPage();
              else setLoadMatches(true);
            }}
            size="sm"
            variant="ghost"
          >
            {loadMatches && pending
              ? t("Loading matches...")
              : t("Load more matches")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
