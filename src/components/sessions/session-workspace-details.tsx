"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { FolderOpen } from "lucide-react";
export function SessionWorkspaceDetails({ workspace }: { workspace: string }) {
  const { t } = useI18n();
  return (
    <div
      aria-label={t("Workspace")}
      className="flex min-w-0 items-center gap-2 text-xs text-ink-tertiary"
    >
      <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span
        title={workspace}
        className="min-w-0 truncate select-text font-mono"
      >
        {workspace}
      </span>
    </div>
  );
}
