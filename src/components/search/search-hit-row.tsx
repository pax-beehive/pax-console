"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkspaceSearchHit } from "@/features/api/workspace-search";
import { LiteralHighlight } from "./literal-highlight";

export function SearchHitRow({
  hit,
  query,
  active,
  onSelect,
}: {
  hit: WorkspaceSearchHit;
  query: string;
  active: boolean;
  onSelect: (trigger: HTMLElement) => void;
}) {
  const { t } = useI18n();
  const label = t(
    { summary: "Summary", message: "Message", session: "Title" }[hit.ref.kind],
  );
  const title = hit.title || label;
  return (
    <Button
      asChild
      className={`block min-h-11 w-full min-w-0 rounded-none border-0 px-4 py-3 text-left ${active ? "bg-surface-2" : ""}`}
      tooltip={title}
      variant="ghost"
    >
      <button
        aria-label={t("Preview {value1}: {value2}", {
          value1: label.toLowerCase(),
          value2: title,
        })}
        aria-pressed={active}
        onClick={(event) => onSelect(event.currentTarget)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="border-0 py-0 font-medium">{label}</Badge>
          <h2 className="min-w-0 truncate text-sm font-medium text-ink">
            <LiteralHighlight text={title} query={query} />
          </h2>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-normal text-sm font-normal leading-6 text-ink-muted [overflow-wrap:anywhere]">
          <LiteralHighlight text={hit.snippet} query={query} />
        </p>
      </button>
    </Button>
  );
}
