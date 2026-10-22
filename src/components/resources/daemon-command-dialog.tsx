"use client";

import { ReactNode, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { useNodeDaemonCommand } from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { NodeDaemonCommandData } from "@/features/api/types";
import {
  DaemonCommandSnapshot,
  daemonCommandSnapshot,
  daemonCommandSteps,
  DeviceCommandKind,
  ProgressStep,
} from "@/features/devices/daemon-commands";
import { cn } from "@/lib/utils";

const paxlProgressPhases = ["downloading", "activating", "verifying"];

type DaemonCommandDialogProps = {
  confirmBody: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  description: ReactNode;
  icon: ReactNode;
  kind: DeviceCommandKind;
  nodeId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** A recorded command to show instead of the confirm step. */
  resumeCommandId?: string;
  submit: () => Promise<NodeDaemonCommandData>;
  successText: (snapshot: DaemonCommandSnapshot) => string;
  title: string;
  userId: string;
};

/**
 * Confirm-then-track dialog for paxd maintenance commands. After submit it
 * stays open and follows the command through the Manager command endpoint;
 * closing it does not cancel anything on the device.
 */
export function DaemonCommandDialog({
  confirmBody,
  confirmDisabled,
  confirmLabel,
  description,
  icon,
  kind,
  nodeId,
  onOpenChange,
  open,
  resumeCommandId,
  submit,
  successText,
  title,
  userId,
}: DaemonCommandDialogProps) {
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState<NodeDaemonCommandData>();
  const [dismissedId, setDismissedId] = useState<string>();
  const [lastPhase, setLastPhase] = useState<string>();
  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: (data) => {
      setSubmitted(data);
      setLastPhase(undefined);
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: queryKeys.nodes(userId),
      });
    },
  });
  const resumable =
    resumeCommandId && resumeCommandId !== dismissedId
      ? resumeCommandId
      : undefined;
  const commandId = submitted?.command_id ?? resumable;
  const command = useNodeDaemonCommand(userId, nodeId, commandId, open);
  const dispatchError = submitted?.dispatch_error;
  const snapshot = daemonCommandSnapshot(kind, command.data, {
    errorMessage: dispatchError,
    status: dispatchError
      ? "dispatch_failed"
      : (submitted?.daemon_command?.status ?? submitted?.command_status),
  });
  // paxd ends failed paxl upgrades with phase "failed"; remember the last
  // real phase so the failing step stays visible.
  if (
    snapshot.phase &&
    paxlProgressPhases.includes(snapshot.phase) &&
    snapshot.phase !== lastPhase
  ) {
    setLastPhase(snapshot.phase);
  }
  const settled = snapshot.state !== "in_progress";
  const reconnecting =
    !settled &&
    Boolean(commandId) &&
    (snapshot.stale || Boolean(command.error));

  useEffect(() => {
    if (!commandId || !settled) {
      return;
    }
    // Pick up the new versions and the settled record on device rows.
    // Exact keys: the node prefix also covers this command query.
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: queryKeys.nodes(userId),
    });
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: queryKeys.node(userId, nodeId),
    });
  }, [commandId, nodeId, queryClient, settled, userId]);

  function startOver() {
    setDismissedId(commandId);
    setSubmitted(undefined);
    mutation.reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next && commandId && settled) {
      startOver();
    }
    onOpenChange(next);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogHeader description={description} icon={icon} title={title} />
      <DialogBody className="grid gap-3">
        {commandId ? (
          <>
            <DaemonCommandSteps
              steps={daemonCommandSteps(kind, snapshot, lastPhase)}
            />
            {snapshot.state === "succeeded" && (
              <p className="text-sm text-success">{successText(snapshot)}</p>
            )}
            {snapshot.state === "failed" && (
              <CommandErrorBox
                message={
                  snapshot.errorMessage ||
                  (snapshot.confirmation === "version_mismatch"
                    ? `paxd reported ${snapshot.observedVersion || "another version"} after the upgrade.`
                    : "The device reported a failure without details.")
                }
              />
            )}
            {reconnecting && (
              <p className="text-xs text-ink-tertiary">
                Waiting for the device to reconnect…
              </p>
            )}
          </>
        ) : (
          <>
            {confirmBody}
            {mutation.error && (
              <CommandErrorBox message={mutation.error.message} />
            )}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        {!commandId ? (
          <>
            <Button
              disabled={mutation.isPending}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending || confirmDisabled}
              onClick={() => mutation.mutate()}
              type="button"
              variant="danger"
            >
              {mutation.isPending ? "Sending…" : confirmLabel}
            </Button>
          </>
        ) : settled ? (
          <>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant={snapshot.state === "failed" ? "ghost" : "secondary"}
            >
              {snapshot.state === "failed" ? "Close" : "Done"}
            </Button>
            {snapshot.state === "failed" && (
              <Button onClick={startOver} type="button">
                Retry
              </Button>
            )}
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-ink-tertiary">
              Closing this keeps the command running on the device.
            </span>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="secondary"
            >
              Close
            </Button>
          </div>
        )}
      </DialogFooter>
    </Dialog>
  );
}

function DaemonCommandSteps({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol aria-label="Progress" className="grid gap-2.5">
      {steps.map((step) => (
        <li
          className={cn(
            "grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2.5 text-sm",
            step.state === "pending" && "text-ink-tertiary",
            step.state === "done" && "text-ink-muted",
            step.state === "active" && "text-ink",
            step.state === "failed" && "text-warning",
          )}
          data-state={step.state}
          key={step.label}
        >
          <StepIcon state={step.state} />
          <span className="min-w-0 truncate">
            {step.label}
            {step.state === "failed" && " failed"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: ProgressStep["state"] }) {
  switch (state) {
    case "done":
      return <Check aria-hidden="true" className="h-4 w-4 text-success" />;
    case "active":
      return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;
    case "failed":
      return <AlertCircle aria-hidden="true" className="h-4 w-4" />;
    default:
      return (
        <Circle aria-hidden="true" className="h-3 w-3 justify-self-center" />
      );
  }
}

function CommandErrorBox({ message }: { message: string }) {
  return (
    <div
      className="break-words rounded-md border border-warning/50 bg-warning/5 px-3 py-2 font-mono text-xs text-ink-muted"
      role="alert"
    >
      {message}
    </div>
  );
}
