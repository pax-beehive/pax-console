"use client";

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  memo,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  FolderOpen,
  ArrowUp,
  FolderPlus,
  LoaderCircle,
  Ellipsis,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionCommandInput } from "@/components/sessions/session-command-input";
import { SessionDraftInput } from "./session-draft-input";
import { SessionPermissionSelector } from "@/components/sessions/session-permission-selector";
import { SessionSecretDialog } from "./session-secret-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QueuedSessionTurnData } from "@/features/api/resources";
import type {
  AgentPermissionCatalog,
  AgentPermissionChoice,
  SessionApprovalMode,
  SessionAvailableCommand,
} from "@/features/api/types";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConsoleStore } from "@/stores/console-store";

type ComposerAttachment = {
  attachmentId: string;
  contentType?: string;
  filename: string;
  sizeBytes?: number;
};

type SessionComposerProps = {
  userId?: string;
  availableCommands?: SessionAvailableCommand[];
  activeAgentId?: string;
  activeNodeId?: string;
  approvalMode: SessionApprovalMode;
  approvalModePending: boolean;
  attachmentError: Error | null;
  attachmentUploadPending: boolean;
  attachments: ComposerAttachment[];
  currentSessionId?: string;
  createEmptySessionPending?: boolean;
  deleteQueuedTurnPending: boolean;
  draftKey: string;
  isNewSession: boolean;
  isTurnRunning: boolean;
  newSessionCwd: string;
  newSessionCwdInvalid: boolean;
  newSessionWorkspaceOpen: boolean;
  onAddAttachments: (files: File[]) => Promise<void>;
  onCreateEmptySession?: () => Promise<boolean>;
  onDeleteQueuedTurn: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSetNewSessionCwd: (value: string) => void;
  onSetNewSessionWorkspaceOpen: (open: boolean) => void;
  onSteer: (content: string) => Promise<boolean>;
  onStop: () => void;
  onSubmitDraft: (content: string) => Promise<boolean>;
  onSelectPermissionChoice?: (choiceId: string) => void;
  onToggleApprovalMode: () => void;
  onUpdateQueuedTurn: (content: string) => Promise<boolean>;
  queueTurnPending: boolean;
  queuedTurn: QueuedSessionTurnData | null | undefined;
  permissionCatalog?: AgentPermissionCatalog;
  permissionCatalogError?: boolean;
  permissionCatalogLoading?: boolean;
  permissionChoiceId?: string;
  permissionChoices?: AgentPermissionChoice[];
  configurationControl?: ReactNode;
  secure?: boolean;
  showAdminFeatures: boolean;
  steerTurnPending: boolean;
  stopTurnPending: boolean;
  supportsQueuedTurns?: boolean;
  updateQueuedTurnPending: boolean;
};

export const SessionComposer = memo(function SessionComposer({
  userId,
  availableCommands,
  activeAgentId,
  activeNodeId,
  approvalMode,
  approvalModePending,
  attachmentError,
  attachmentUploadPending,
  attachments,
  currentSessionId,
  createEmptySessionPending = false,
  deleteQueuedTurnPending,
  draftKey,
  isNewSession,
  isTurnRunning,
  newSessionCwd,
  newSessionCwdInvalid,
  newSessionWorkspaceOpen,
  onAddAttachments,
  onCreateEmptySession,
  onDeleteQueuedTurn,
  onRemoveAttachment,
  onSetNewSessionCwd,
  onSetNewSessionWorkspaceOpen,
  onSteer,
  onStop,
  onSubmitDraft,
  onSelectPermissionChoice,
  onToggleApprovalMode,
  onUpdateQueuedTurn,
  queueTurnPending,
  queuedTurn,
  permissionCatalog,
  permissionCatalogError,
  permissionCatalogLoading,
  permissionChoiceId,
  permissionChoices,
  configurationControl,
  secure = false,
  showAdminFeatures,
  steerTurnPending,
  stopTurnPending,
  supportsQueuedTurns = true,
  updateQueuedTurnPending,
}: SessionComposerProps) {
  const hasContent = useConsoleStore((state) =>
    Boolean(state.composerDrafts[draftKey]?.trim()),
  );
  const setComposerDraft = useConsoleStore((state) => state.setComposerDraft);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [queuedTurnEditingId, setQueuedTurnEditingId] = useState<string | null>(
    null,
  );
  const [queuedTurnDraft, setQueuedTurnDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasAttachments = attachments.length > 0;
  const canSend =
    Boolean(activeAgentId && activeNodeId) &&
    !isTurnRunning &&
    !newSessionCwdInvalid &&
    !attachmentUploadPending &&
    hasContent;
  const canQueueTurn =
    isTurnRunning &&
    supportsQueuedTurns &&
    Boolean(activeAgentId && currentSessionId) &&
    hasContent &&
    !hasAttachments &&
    !attachmentUploadPending &&
    !queueTurnPending;
  const canSteerTurn =
    isTurnRunning &&
    supportsQueuedTurns &&
    Boolean(activeAgentId && currentSessionId) &&
    hasContent &&
    !hasAttachments &&
    !attachmentUploadPending &&
    !steerTurnPending;
  const canStopTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    !stopTurnPending;
  const canCreateEmptySession =
    isNewSession &&
    !secure &&
    Boolean(activeAgentId && activeNodeId && onCreateEmptySession) &&
    !isTurnRunning &&
    !newSessionCwdInvalid &&
    !attachmentUploadPending &&
    !hasAttachments &&
    !createEmptySessionPending;

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
    const content =
      useConsoleStore.getState().composerDrafts[draftKey]?.trim() ?? "";
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
    const content =
      useConsoleStore.getState().composerDrafts[draftKey]?.trim() ?? "";
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
      aria-label={secure ? "Encrypted session composer" : undefined}
      className={cn(
        "mobile-safe-bottom relative z-10 border-t p-3 transition-[background-color,border-color] duration-500",
        secure
          ? "border-emerald-400/20 bg-emerald-500/[0.035] backdrop-blur-xl"
          : "border-hairline bg-surface-1",
      )}
      data-secure-mode={secure}
      onSubmit={submit}
    >
      <input
        className="sr-only"
        disabled={secure}
        multiple
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          if (files.length > 0) {
            void onAddAttachments(files);
          }
          event.currentTarget.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      <div
        className={cn(
          "mx-auto w-full max-w-4xl rounded-[22px] border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-500",
          secure
            ? "border-emerald-400/45 bg-surface-2/95 shadow-[0_0_0_1px_rgba(52,211,153,0.04),0_10px_36px_rgba(16,185,129,0.07)] focus-within:border-emerald-400/70 focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.08),0_14px_44px_rgba(16,185,129,0.10)]"
            : "border-hairline bg-surface-2 shadow-lg shadow-black/20",
        )}
      >
        {queuedTurn && (
          <div className="mb-2 grid gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-medium text-primary-hover">
                {queuedTurn.state === "sending"
                  ? "Sending queued message"
                  : queuedTurn.state === "uncertain"
                    ? "Delivery unconfirmed"
                    : "Queued next"}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-tertiary">
                {compactId(queuedTurn.queued_turn_id)}
              </span>
              {queuedTurnEditingId !== queuedTurn.queued_turn_id &&
                (!queuedTurn.state || queuedTurn.state === "queued") && (
                  <Button
                    aria-label="Edit queued message"
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
                aria-label="Delete queued message"
                disabled={
                  deleteQueuedTurnPending || queuedTurn.state === "sending"
                }
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
            {queuedTurn.state === "uncertain" && (
              <p className="text-xs text-warning">
                Delivery could not be confirmed. Check the conversation before
                sending again. Deleting this entry does not cancel a message
                already received by paxd.
              </p>
            )}
            {queuedTurnEditingId === queuedTurn.queued_turn_id &&
            (!queuedTurn.state || queuedTurn.state === "queued") ? (
              <div className="grid gap-2">
                <SessionCommandInput
                  commands={secure ? undefined : availableCommands}
                  aria-label="Queued message"
                  autoFocus
                  className="max-h-32 min-h-16 w-full resize-y rounded-lg border border-hairline bg-canvas px-2.5 py-2 text-base leading-6 text-ink outline-none focus:border-primary-focus focus:ring-2 focus:ring-primary-focus/20 sm:text-sm sm:leading-5"
                  onValueChange={setQueuedTurnDraft}
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
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <Badge
                className="max-w-full"
                key={attachment.attachmentId}
                tooltip={attachment.filename}
              >
                <span className="max-w-44 truncate">{attachment.filename}</span>
                <button
                  aria-label={`Remove ${attachment.filename}`}
                  className="ml-1 shrink-0 text-ink-tertiary transition hover:text-ink"
                  onClick={() => onRemoveAttachment(attachment.attachmentId)}
                  type="button"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        {attachmentError && (
          <div className="mb-2 text-xs text-warning">
            {attachmentError.name}: {attachmentError.message}
          </div>
        )}
        <SessionDraftInput
          key={draftKey}
          draftKey={draftKey}
          commands={secure ? undefined : availableCommands}
          className="max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-base leading-6 text-ink outline-none [field-sizing:content] placeholder:text-ink-tertiary sm:text-sm sm:leading-5"
          disabled={!activeAgentId}
          enterKeyHint="send"
          onKeyDown={handleKeyDown}
          placeholder={
            secure
              ? "Send an end-to-end encrypted message"
              : activeAgentId
                ? "Send a prompt to this agent"
                : "Select an agent before sending a prompt"
          }
          rows={1}
        />
        {isTurnRunning && hasAttachments && (
          <span className="mb-2 block text-xs text-warning">
            Wait for the current turn to finish before sending attachments.
          </span>
        )}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 sm:gap-2",
            isNewSession && "flex-wrap",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={
                  userId && activeNodeId && currentSessionId
                    ? "Add to conversation"
                    : "Upload files"
                }
                disabled={
                  (attachmentUploadPending || secure) &&
                  !(userId && activeNodeId && currentSessionId)
                }
                icon={
                  attachmentUploadPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )
                }
                size="icon"
                tooltip={
                  userId && activeNodeId && currentSessionId
                    ? "Add files or securely send a secret"
                    : secure
                      ? "Attachments are not supported in encrypted sessions yet"
                      : "Upload files"
                }
                type="button"
                variant="ghost"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64" side="top">
              <DropdownMenuItem
                disabled={attachmentUploadPending || secure}
                onSelect={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                Upload
              </DropdownMenuItem>
              {userId && activeNodeId && currentSessionId && (
                <DropdownMenuItem onSelect={() => setSecretDialogOpen(true)}>
                  <ShieldCheck className="h-4 w-4" />
                  Securely send password / token
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {isNewSession ? (
            newSessionWorkspaceOpen ? (
              <label
                className={cn(
                  "order-first inline-flex min-h-9 min-w-0 basis-full items-center gap-2 rounded-lg border bg-canvas px-2.5 text-sm transition sm:order-none sm:min-w-64 sm:max-w-96 sm:basis-auto sm:flex-1",
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
                  className="min-w-0 flex-1 bg-transparent font-mono text-base text-ink outline-none placeholder:text-ink-tertiary sm:text-xs"
                  onChange={(event) => onSetNewSessionCwd(event.target.value)}
                  placeholder="~/project"
                  spellCheck={false}
                  value={newSessionCwd}
                />
              </label>
            ) : (
              <Button
                aria-label="Set workspace"
                icon={<FolderPlus className="h-4 w-4" />}
                onClick={() => onSetNewSessionWorkspaceOpen(true)}
                size="icon"
                tooltip="Set workspace"
                type="button"
                variant="ghost"
              />
            )
          ) : null}
          {configurationControl}
          {permissionChoices?.length &&
          permissionChoiceId &&
          onSelectPermissionChoice ? (
            <SessionPermissionSelector
              catalog={permissionCatalog}
              choices={permissionChoices}
              disabled={approvalModePending}
              error={permissionCatalogError}
              loading={permissionCatalogLoading}
              onChange={onSelectPermissionChoice}
              value={permissionChoiceId}
            />
          ) : (
            <Button
              aria-label={
                approvalMode === "auto_approve_all"
                  ? "Auto approve tools without asking"
                  : "Ask before running tools"
              }
              aria-pressed={approvalMode === "auto_approve_all"}
              className={cn(
                approvalMode === "auto_approve_all"
                  ? "border-success/25 bg-success/10 text-success hover:bg-success/15 hover:text-success"
                  : "text-primary-hover",
              )}
              disabled={approvalModePending}
              icon={<ShieldCheck className="h-4 w-4" />}
              onClick={onToggleApprovalMode}
              size="icon"
              tooltip={
                approvalMode === "auto_approve_all"
                  ? "Auto approve tools without asking · tap to require approval"
                  : "Ask before running tools · tap to auto approve"
              }
              tooltipOnClick
              type="button"
              variant="ghost"
            />
          )}
          <div className="min-w-0 flex-1" />
          {showAdminFeatures && (
            <Button
              aria-label="Voice input is not available yet"
              className="hidden sm:inline-flex"
              disabled
              icon={<Mic className="h-4 w-4" />}
              size="icon"
              tooltip="Voice input is not available yet"
              type="button"
              variant="ghost"
            />
          )}
          {isTurnRunning ? (
            <>
              <Button
                aria-label={
                  currentSessionId
                    ? "Queue after current turn"
                    : "Waiting for session id"
                }
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
                className="hidden sm:inline-flex"
                aria-label={
                  currentSessionId
                    ? "Steer with this prompt"
                    : "Waiting for session id"
                }
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More turn actions"
                    className="sm:hidden"
                    icon={<Ellipsis className="h-4 w-4" />}
                    size="icon"
                    type="button"
                    variant="ghost"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuItem
                    disabled={!canSteerTurn}
                    onSelect={() => void steer()}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Steer with this prompt
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                aria-label={
                  currentSessionId
                    ? "Stop current turn"
                    : "Waiting for session id"
                }
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
            <>
              <Button
                aria-label="Send prompt"
                className={cn(
                  "rounded-full",
                  !secure &&
                    "border-accent-bright bg-accent-bright text-canvas hover:bg-accent",
                  secure &&
                    "border-emerald-400/60 bg-emerald-400 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,0.16)] hover:bg-emerald-300",
                )}
                disabled={!canSend}
                icon={<ArrowUp className="h-5 w-5" />}
                size="icon"
                tooltip="Send prompt"
                type="submit"
                variant="primary"
              />
              {isNewSession && !secure && onCreateEmptySession && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Advanced session actions"
                      disabled={createEmptySessionPending}
                      icon={
                        createEmptySessionPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ellipsis className="h-4 w-4" />
                        )
                      }
                      size="icon"
                      tooltip="Advanced session actions"
                      type="button"
                      variant="ghost"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
                      Advanced
                    </div>
                    <DropdownMenuItem
                      className="items-start py-2"
                      disabled={!canCreateEmptySession}
                      onSelect={() => void onCreateEmptySession()}
                    >
                      <span className="min-w-0">
                        <span className="block text-ink">
                          Create empty session
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-ink-tertiary">
                          Initialize the agent without sending a prompt.
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </div>
      {userId && activeNodeId && currentSessionId && (
        <SessionSecretDialog
          key={`${draftKey}:${activeNodeId}`}
          open={secretDialogOpen}
          onOpenChange={setSecretDialogOpen}
          userId={userId}
          nodeId={activeNodeId}
          onDelivered={({ fileRef, expiresAt }) => {
            const existing =
              useConsoleStore.getState().composerDrafts[draftKey] ?? "";
            const reference = `A secret was delivered to this session's node in temporary file ${JSON.stringify(fileRef)} (expires ${expiresAt}). Use it locally without printing its contents or including them in tool output/chat. Delete the temporary file after use, including on failure.`;
            setComposerDraft(
              draftKey,
              existing ? `${existing}\n\n${reference}` : reference,
            );
          }}
        />
      )}
    </form>
  );
});
