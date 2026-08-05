"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { queryKeys } from "@/features/api/query-keys";
import {
  restartNodeDaemon,
  upgradeNodeDaemon,
  useLatestPaxdRelease,
} from "@/features/api/resources";
import { NodeDaemonCommandData, PaxdRelease } from "@/features/api/types";
import { compactId } from "@/lib/format";

type NodeMaintenanceActionsProps = {
  currentVersion?: string;
  disabled?: boolean;
  nodeArch?: string;
  nodeId: string;
  nodeLabel: string;
  nodeOS?: string;
  userId: string;
};

type CommandFeedback = {
  commandId: string;
  label: string;
};

export function NodeMaintenanceActions({
  currentVersion,
  disabled,
  nodeArch,
  nodeId,
  nodeLabel,
  nodeOS,
  userId,
}: NodeMaintenanceActionsProps) {
  const queryClient = useQueryClient();
  const [restartOpen, setRestartOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback>();
  const latestRelease = useLatestPaxdRelease(nodeOS, nodeArch, upgradeOpen);

  const recordCommand = (data: NodeDaemonCommandData, action: string) => {
    const status = data.confirmation_status?.replaceAll("_", " ");
    setFeedback({
      commandId: data.command_id,
      label: [action, data.dispatch_status ?? data.command_status, status]
        .filter(Boolean)
        .join(" · "),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.node(userId, nodeId),
    });
  };

  const restart = useMutation({
    mutationFn: () => restartNodeDaemon(userId, nodeId),
    onMutate: () => setFeedback(undefined),
    onSuccess: (data) => {
      setRestartOpen(false);
      recordCommand(data, "restart");
    },
  });
  const upgrade = useMutation({
    mutationFn: async () => {
      const version = latestRelease.data?.version.trim();
      if (!version) {
        throw new Error("No stable paxd release is available for this node.");
      }
      return upgradeNodeDaemon(userId, nodeId, { version });
    },
    onMutate: () => setFeedback(undefined),
    onSuccess: (data) => {
      setUpgradeOpen(false);
      recordCommand(data, "upgrade");
    },
  });
  const busy = restart.isPending || upgrade.isPending;

  return (
    <div className="grid min-w-0 justify-items-end gap-1">
      <div className="flex items-start justify-end gap-1">
        <Button
          aria-label="Upgrade paxd immediately"
          disabled={disabled || busy}
          icon={<Download className="h-4 w-4" />}
          onClick={() => setUpgradeOpen(true)}
          size="icon"
          tooltip="Upgrade paxd immediately"
          type="button"
          variant="ghost"
        />
        <Button
          aria-label="Restart paxd immediately"
          disabled={disabled || busy}
          icon={<RotateCw className="h-4 w-4" />}
          onClick={() => setRestartOpen(true)}
          size="icon"
          tooltip="Restart paxd immediately"
          type="button"
          variant="danger"
        />
      </div>

      {feedback && (
        <span
          className="max-w-44 truncate text-right font-mono text-[11px] text-ink-tertiary"
          title={`${feedback.label} · ${feedback.commandId}`}
        >
          {feedback.label} · {compactId(feedback.commandId)}
        </span>
      )}

      <ConfirmDialog
        confirmLabel={
          restart.isPending ? "Restarting..." : "Restart immediately"
        }
        description={
          <div className="grid gap-2">
            <p>
              Restart paxd on{" "}
              <span className="font-medium text-ink">{nodeLabel}</span> now? The
              node will disconnect briefly while its service supervisor starts a
              new paxd process.
            </p>
            <p className="text-warning">
              Immediate mode can interrupt active agent work on this node.
            </p>
            {restart.error && <CommandError error={restart.error} />}
          </div>
        }
        disabled={restart.isPending}
        onConfirm={() => restart.mutate()}
        onOpenChange={setRestartOpen}
        open={restartOpen}
        title="Restart paxd immediately?"
      />

      <UpgradeDialog
        currentVersion={currentVersion}
        disabled={upgrade.isPending}
        error={upgrade.error}
        latestRelease={latestRelease.data}
        latestReleaseError={latestRelease.error}
        loadingLatestRelease={latestRelease.isLoading}
        nodeLabel={nodeLabel}
        onConfirm={() => upgrade.mutate()}
        onOpenChange={setUpgradeOpen}
        open={upgradeOpen}
        platformKnown={Boolean(nodeOS && nodeArch)}
      />
    </div>
  );
}

function UpgradeDialog({
  currentVersion,
  disabled,
  error,
  latestRelease,
  latestReleaseError,
  loadingLatestRelease,
  nodeLabel,
  onConfirm,
  onOpenChange,
  open,
  platformKnown,
}: {
  currentVersion?: string;
  disabled: boolean;
  error: Error | null;
  latestRelease?: PaxdRelease;
  latestReleaseError: Error | null;
  loadingLatestRelease: boolean;
  nodeLabel: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  platformKnown: boolean;
}) {
  const upToDate = versionsMatch(currentVersion, latestRelease?.version);
  const canUpgrade =
    platformKnown &&
    Boolean(latestRelease?.version.trim()) &&
    !latestReleaseError &&
    !loadingLatestRelease &&
    !upToDate;
  const confirmLabel = disabled
    ? "Upgrading..."
    : loadingLatestRelease
      ? "Checking release..."
      : upToDate
        ? "Already up to date"
        : "Upgrade immediately";

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),440px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning bg-canvas text-warning">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium text-ink">
                Upgrade paxd immediately?
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-ink-muted">
                Download, verify, and activate a new paxd binary on {nodeLabel}.
                The node will disconnect while its service supervisor starts the
                new version.
              </Dialog.Description>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-hairline bg-canvas px-3 py-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-tertiary">Latest stable version</span>
              <span className="font-mono text-sm text-ink">
                {loadingLatestRelease
                  ? "checking..."
                  : latestRelease?.version || "unavailable"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-tertiary">Platform</span>
              <span className="font-mono text-ink-muted">
                {latestRelease?.platform || "unknown"}
              </span>
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-tertiary">
            Current version: {currentVersion || "unknown"}. Immediate mode can
            interrupt active agent work.
          </p>
          {!platformKnown && (
            <CommandError
              error={
                new Error("This node did not report its OS and architecture.")
              }
            />
          )}
          {latestReleaseError && <CommandError error={latestReleaseError} />}
          {upToDate && (
            <p className="text-xs text-success">paxd is up to date.</p>
          )}
          {error && <CommandError error={error} />}

          <div className="flex justify-end gap-2 border-t border-hairline pt-3">
            <Dialog.Close asChild>
              <Button disabled={disabled} type="button" variant="ghost">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              disabled={disabled || !canUpgrade}
              onClick={onConfirm}
              type="button"
              variant="danger"
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function versionsMatch(currentVersion?: string, latestVersion?: string) {
  if (!currentVersion || !latestVersion) {
    return false;
  }
  const normalize = (version: string) =>
    version.trim().toLowerCase().replace(/^v/, "");
  return normalize(currentVersion) === normalize(latestVersion);
}

function CommandError({ error }: { error: Error }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning bg-canvas px-3 py-2 text-xs text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <span>{error.message}</span>
    </div>
  );
}
