"use client";
import { useState } from "react";
import { ChevronDown, FolderOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isSupportedSessionWorkspace } from "@/features/runtime/workspace-path";
import { cn } from "@/lib/utils";

type Target = { target_id: string; cwd: string; is_default?: boolean };
export function WorkspacePicker({
  value,
  targets,
  save,
  canSave,
  disabled,
  loading,
  onChange,
}: {
  value: string;
  targets: Target[];
  save: boolean;
  canSave: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (cwd: string, save: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"saved" | "path">(
    targets.length ? "saved" : "path",
  );
  const [path, setPath] = useState(value);
  const [saveTarget, setSaveTarget] = useState(save);
  const valid = isSupportedSessionWorkspace(path.trim());
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTab(targets.length ? "saved" : "path");
          setPath(value);
          setSaveTarget(save);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label="Choose workspace"
          variant="ghost"
          size="sm"
          type="button"
          disabled={disabled || loading}
          className="w-full min-w-0 justify-start text-ink-tertiary [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-center [&>span]:gap-2"
          icon={<FolderOpen className="h-3.5 w-3.5 shrink-0" />}
        >
          <span className="truncate font-mono text-xs">
            {loading
              ? "Loading workspaces…"
              : value ||
                (canSave ? "Choose a workspace" : "Agent default directory")}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div
          className="mb-3 flex gap-1 rounded-lg bg-canvas p-1"
          role="tablist"
          aria-label="Workspace source"
        >
          {(
            [
              ["saved", "Saved workspaces"],
              ["path", "Enter a path"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              variant="ghost"
              size="sm"
              className={cn("flex-1", tab === id && "bg-surface-3 text-ink")}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {tab === "saved" ? (
          <div
            role="tabpanel"
            aria-label="Saved workspaces"
            className="grid gap-1"
          >
            {targets.map((target) => (
              <Button
                key={target.target_id}
                type="button"
                variant="ghost"
                className="h-auto min-h-10 justify-start text-left"
                onClick={() => {
                  onChange(target.cwd, false);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 break-all font-mono text-xs">
                  {target.cwd}
                  {target.is_default && (
                    <span className="ml-2 font-sans text-ink-tertiary">
                      Default
                    </span>
                  )}
                </span>
                {target.cwd === value && <Check className="h-4 w-4 shrink-0" />}
              </Button>
            ))}
            {!targets.length && (
              <p className="p-2 text-sm text-ink-tertiary">
                No saved workspaces for this project and agent.
              </p>
            )}
          </div>
        ) : (
          <div role="tabpanel" aria-label="Enter a path" className="grid gap-3">
            <label className="grid gap-2 text-xs text-ink-muted">
              Workspace
              <input
                aria-label="Workspace"
                aria-invalid={Boolean(path.trim()) && !valid}
                value={path}
                onChange={(event) => setPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (valid) {
                      onChange(path.trim(), canSave && saveTarget);
                      setOpen(false);
                    }
                  }
                }}
                placeholder="~/project"
                spellCheck={false}
                className="min-w-0 rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-base text-ink outline-none focus:border-accent"
              />
            </label>
            <p className="text-xs text-ink-tertiary">
              Use an absolute path, ~, or a path starting with ~/.
            </p>
            {canSave && (
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={saveTarget}
                  onChange={(event) => setSaveTarget(event.target.checked)}
                />
                Save as workspace target
              </label>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={!valid}
              onClick={() => {
                onChange(path.trim(), canSave && saveTarget);
                setOpen(false);
              }}
            >
              Use this path
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
