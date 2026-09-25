import { FolderOpen } from "lucide-react";
export function SessionWorkspaceDetails({ workspace }: { workspace: string }) {
  return (
    <div
      aria-label="Workspace"
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
