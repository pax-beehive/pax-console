"use client";

import { FormEvent, KeyboardEvent, memo, useCallback, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueuedSessionTurnData } from "@/features/api/resources";
import type { SessionApprovalMode } from "@/features/api/types";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConsoleStore } from "@/stores/console-store";

type SessionComposerProps = {
  activeAgentId?: string;
  activeNodeId?: string;
  approvalMode: SessionApprovalMode;
  approvalModePending: boolean;
  currentSessionId?: string;
  deleteQueuedTurnPending: boolean;
  draftKey: string;
  isNewSession: boolean;
  isTurnRunning: boolean;
  newSessionCwd: string;
  newSessionCwdInvalid: boolean;
  newSessionWorkspaceOpen: boolean;
  onDeleteQueuedTurn: () => void;
  onOpenArtifacts: () => void;
  onSetNewSessionCwd: (value: string) => void;
  onSetNewSessionWorkspaceOpen: (open: boolean) => void;
  onSteer: (content: string) => Promise<boolean>;
  onStop: () => void;
  onSubmitDraft: (content: string) => Promise<boolean>;
  onToggleApprovalMode: () => void;
  onUpdateQueuedTurn: (content: string) => Promise<boolean>;
  queueTurnPending: boolean;
  queuedTurn: QueuedSessionTurnData | null | undefined;
  readOnlyWorkspace?: string;
  steerTurnPending: boolean;
  stopTurnPending: boolean;
  updateQueuedTurnPending: boolean;
};

export const SessionComposer = memo(function SessionComposer({
  activeAgentId,
  activeNodeId,
  approvalMode,
  approvalModePending,
  currentSessionId,
  deleteQueuedTurnPending,
  draftKey,
  isNewSession,
  isTurnRunning,
  newSessionCwd,
  newSessionCwdInvalid,
  newSessionWorkspaceOpen,
  onDeleteQueuedTurn,
  onOpenArtifacts,
  onSetNewSessionCwd,
  onSetNewSessionWorkspaceOpen,
  onSteer,
  onStop,
  onSubmitDraft,
  onToggleApprovalMode,
  onUpdateQueuedTurn,
  queueTurnPending,
  queuedTurn,
  readOnlyWorkspace,
  steerTurnPending,
  stopTurnPending,
  updateQueuedTurnPending,
}: SessionComposerProps) {
  const draft = useConsoleStore(
    (state) => state.composerDrafts[draftKey] ?? "",
  );
  const setComposerDraft = useConsoleStore((state) => state.setComposerDraft);
  const [queuedTurnEditingId, setQueuedTurnEditingId] = useState<string | null>(
    null,
  );
  const [queuedTurnDraft, setQueuedTurnDraft] = useState("");
  const content = draft.trim();
  const canSend =
    Boolean(activeAgentId && activeNodeId) &&
    !isTurnRunning &&
    !newSessionCwdInvalid &&
    content.length > 0;
  const canQueueTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    content.length > 0 &&
    !queueTurnPending;
  const canSteerTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    content.length > 0 &&
    !steerTurnPending;
  const canStopTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    !stopTurnPending;

  const clearDraft = useCallback(() => {
    setComposerDraft(draftKey, "");
  }, [draftKey, setComposerDraft]);

  const clearSubmittedDraft = useCallback(
    (submittedContent: string) => {
      const currentDraft =
        useConsoleStore.getState().composerDrafts[draftKey] ?? "";
      if (currentDraft.trim() === submittedContent) {
        clearDraft();
      }
    },
    [clearDraft, draftKey],
  );

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if ((!canSend && !canQueueTurn) || !content) {
      return;
    }
    const submission = onSubmitDraft(content);
    if (isTurnRunning) {
      void submission.then((accepted) => {
        if (accepted) {
          clearSubmittedDraft(content);
        }
      });
      return;
    }
    clearSubmittedDraft(content);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();
    submit();
  }

  function steer() {
    if (!canSteerTurn || !content) {
      return;
    }
    void onSteer(content).then((accepted) => {
      if (accepted) {
        clearSubmittedDraft(content);
      }
    });
  }

  return (
    <form
      className="mobile-safe-bottom relative z-10 border-t border-hairline bg-surface-1 p-3"
      onSubmit={submit}
    >
      <div className="mx-auto w-full max-w-4xl rounded-[22px] border border-hairline bg-surface-2 px-3 py-2 shadow-lg shadow-black/20">
        {queuedTurn && (
          <div className="mb-2 grid gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-medium text-primary-hover">
                Queued next
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-tertiary">
                {compactId(queuedTurn.queued_turn_id)}
              </span>
              {queuedTurnEditingId !== queuedTurn.queued_turn_id && (
                <Button
                  disabled={deleteQueuedTurnPending}
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setQueuedTurnDraft(queuedTurn.input);
                    setQueuedTurnEditingId(queuedTurn.queued_turn_id);
                  }}
                  size="icon"
                  tooltip="Edit queued message"
                  type="button"
                  variant="ghost"
                />
              )}
              <Button
                disabled={deleteQueuedTurnPending}
                icon={
                  deleteQueuedTurnPending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )
                }
                onClick={onDeleteQueuedTurn}
                size="icon"
                tooltip="Delete queued message"
                type="button"
                variant="ghost"
              />
            </div>
            {queuedTurnEditingId === queuedTurn.queued_turn_id ? (
              <div className="grid gap-2">
                <textarea
                  aria-label="Queued message"
                  autoFocus
                  className="max-h-32 min-h-16 w-full resize-y rounded-lg border border-hairline bg-canvas px-2.5 py-2 text-sm leading-5 text-ink outline-none focus:border-primary-focus focus:ring-2 focus:ring-primary-focus/20"
                  onChange={(event) => setQueuedTurnDraft(event.target.value)}
                  value={queuedTurnDraft}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={updateQueuedTurnPending}
                    onClick={() => {
                      setQueuedTurnEditingId(null);
                      setQueuedTurnDraft("");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      updateQueuedTurnPending ||
                      queuedTurnDraft.trim().length === 0
                    }
                    icon={
                      updateQueuedTurnPending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() => {
                      void onUpdateQueuedTurn(queuedTurnDraft.trim()).then(
                        (updated) => {
                          if (updated) {
                            setQueuedTurnEditingId(null);
                            setQueuedTurnDraft("");
                          }
                        },
                      );
                    }}
                    size="sm"
                    type="button"
                    variant="primary"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="max-h-24 overflow-auto whitespace-pre-wrap text-sm leading-5 text-ink-muted">
                {queuedTurn.input}
              </p>
            )}
          </div>
        )}
        <textarea
          className="max-h-40 min-h-7 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm leading-5 text-ink outline-none [field-sizing:content] placeholder:text-ink-tertiary"
          disabled={!activeAgentId}
          onChange={(event) => setComposerDraft(draftKey, event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeAgentId
              ? "Send a prompt to this agent"
              : "Select an agent before sending a prompt"
          }
          rows={1}
          value={draft}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={onOpenArtifacts}
            size="icon"
            tooltip="Open artifacts"
            type="button"
            variant="ghost"
          />
          {isNewSession ? (
            newSessionWorkspaceOpen ? (
              <label
                className={cn(
                  "inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-canvas px-2.5 text-sm transition sm:max-w-80",
                  newSessionCwdInvalid
                    ? "border-warning text-warning"
                    : "border-hairline text-ink-muted focus-within:border-primary-focus focus-within:ring-2 focus-within:ring-primary-focus/20",
                )}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (
                    (nextTarget instanceof globalThis.Node &&
                      event.currentTarget.contains(nextTarget)) ||
                    newSessionCwd.trim()
                  ) {
                    return;
                  }
                  onSetNewSessionWorkspaceOpen(false);
                }}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="shrink-0 text-xs font-medium text-ink-tertiary">
                  Workspace
                </span>
                <input
                  aria-invalid={newSessionCwdInvalid}
                  aria-label="Workspace"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-tertiary"
                  onChange={(event) => onSetNewSessionCwd(event.target.value)}
                  placeholder="/Users/me/project"
                  spellCheck={false}
                  value={newSessionCwd}
                />
              </label>
            ) : (
              <Button
                icon={<FolderPlus className="h-4 w-4" />}
                onClick={() => onSetNewSessionWorkspaceOpen(true)}
                size="icon"
                tooltip="Set workspace"
                type="button"
                variant="ghost"
              />
            )
          ) : readOnlyWorkspace ? (
            <div className="inline-flex min-h-9 min-w-0 max-w-64 items-center gap-2 rounded-lg border border-hairline bg-canvas px-2.5 text-sm text-ink-muted">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="shrink-0 text-xs font-medium text-ink-tertiary">
                Workspace
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-ink">
                {readOnlyWorkspace}
              </span>
            </div>
          ) : null}
          <button
            aria-pressed={approvalMode === "auto_approve_all"}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
              approvalMode === "auto_approve_all"
                ? "bg-success/10 text-success"
                : "text-primary-hover hover:bg-surface-3",
            )}
            disabled={approvalModePending}
            onClick={onToggleApprovalMode}
            type="button"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">
              {approvalMode === "auto_approve_all"
                ? "Auto approve"
                : "Manual approve"}
            </span>
          </button>
          <div className="min-w-0 flex-1" />
          <Button
            disabled
            icon={<Mic className="h-4 w-4" />}
            size="icon"
            tooltip="Voice input is not available yet"
            type="button"
            variant="ghost"
          />
          {isTurnRunning ? (
            <>
              <Button
                disabled={!canQueueTurn}
                icon={
                  queueTurnPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )
                }
                size="icon"
                tooltip={
                  currentSessionId
                    ? "Queue after current turn"
                    : "Waiting for session id"
                }
                type="submit"
                variant="primary"
              />
              <Button
                disabled={!canSteerTurn}
                icon={
                  steerTurnPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                onClick={steer}
                size="icon"
                tooltip={
                  currentSessionId
                    ? "Steer with this prompt"
                    : "Waiting for session id"
                }
                type="button"
                variant="ghost"
              />
              <Button
                disabled={!canStopTurn}
                icon={
                  stopTurnPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4 fill-current" />
                  )
                }
                onClick={onStop}
                size="icon"
                tooltip={
                  currentSessionId
                    ? "Stop current turn"
                    : "Waiting for session id"
                }
                type="button"
                variant="danger"
              />
            </>
          ) : (
            <Button
              disabled={!canSend}
              icon={<Send className="h-4 w-4" />}
              size="icon"
              tooltip="Send prompt"
              type="submit"
              variant="primary"
            />
          )}
        </div>
      </div>
    </form>
  );
});
