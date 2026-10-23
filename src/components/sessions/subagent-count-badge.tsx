"use client";

import { Tooltip } from "@/components/ui/tooltip";

/** The number of working subagents, next to the run status. Hover or tap explains it. */
export function SubagentCountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  const label =
    count === 1 ? "1 subagent running" : `${count} subagents running`;

  return (
    <Tooltip content={label} openOnClick>
      <button
        aria-label={label}
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/10 px-1.5 text-xs leading-none text-accent-bright outline-none focus-visible:ring-2 focus-visible:ring-primary-focus/40"
        type="button"
      >
        {count}
      </button>
    </Tooltip>
  );
}
