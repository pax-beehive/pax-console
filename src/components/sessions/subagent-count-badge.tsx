"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { TruncatedText } from "@/components/ui/text";

/** Subagent activity beside the run status. */
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
  if (label) {
    return (
      <TruncatedText
        aria-label={label}
        className="mx-1 shrink-0 text-[11px] leading-5 text-ink-subtle"
      >
        {label}
      </TruncatedText>
    );
  }
  const description =
    count === 1 ? "1 subagent running" : `${count} subagents running`;

  return (
    <Tooltip content={description} openOnClick>
      <button
        aria-label={description}
        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-1.5 text-xs leading-none text-accent-bright outline-none focus-visible:ring-2 focus-visible:ring-primary-focus/40"
        type="button"
      >
        {count}
      </button>
    </Tooltip>
  );
}
