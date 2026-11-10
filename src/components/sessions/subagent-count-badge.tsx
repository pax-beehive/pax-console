"use client";

import { Tooltip } from "@/components/ui/tooltip";

/** The number of working subagents, next to the run status. Hover or tap explains it. */
export function SubagentCountBadge({
  count,
  label,
}: {
  count: number;
  label?: string;
}) {
  if (count <= 0) {
    return null;
  }
  const description =
    label ??
    (count === 1 ? "1 subagent running" : `${count} subagents running`);

  return (
    <Tooltip content={description} openOnClick>
      <button
        aria-label={description}
        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-1.5 text-xs leading-none text-accent-bright outline-none focus-visible:ring-2 focus-visible:ring-primary-focus/40"
        type="button"
      >
        {label ?? count}
      </button>
    </Tooltip>
  );
}
