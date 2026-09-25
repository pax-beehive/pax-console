"use client";

import { Check, Copy, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SessionWorkspaceDetails({ workspace }: { workspace: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  async function copyWorkspace() {
    try {
      await navigator.clipboard.writeText(workspace);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-2 text-xs text-ink-tertiary">
      <FolderOpen aria-hidden="true" className="mt-2 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 py-1">
        <div className="mb-1 text-[11px]">Workspace</div>
        <div className="select-text break-all font-mono leading-5 text-ink-muted">
          {workspace}
        </div>
        <span
          role="status"
          className={copyState === "error" ? "text-warning" : "sr-only"}
        >
          {copyState === "copied"
            ? "Workspace copied"
            : copyState === "error"
              ? "Could not copy. Select the path to copy it manually."
              : ""}
        </span>
      </div>
      <Button
        aria-label="Copy workspace path"
        icon={
          copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )
        }
        onClick={() => void copyWorkspace()}
        size="icon"
        tooltip={copyState === "copied" ? "Copied" : "Copy workspace path"}
        type="button"
        variant="ghost"
      />
    </div>
  );
}
