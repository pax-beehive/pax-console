"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { useI18n } from "@/features/i18n/use-i18n";

/** Subagent activity beside the run status. */
export function SubagentCountBadge({
  count,
  label,
}: {
  count: number;
  label?: string;
}) {
  const { t } = useI18n();
  if (count <= 0) {
    return null;
  }
  const description =
    label ??
    (count === 1
      ? t("1 subagent running")
      : t("{count} subagents running", { count }));

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
