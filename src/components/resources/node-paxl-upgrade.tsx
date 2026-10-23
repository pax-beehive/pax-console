"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getLatestPaxlRelease,
  upgradeNodePaxl,
} from "@/features/api/resources";
import { Node } from "@/features/api/types";
import {
  paxlObservation,
  versionsEqual,
} from "@/features/devices/daemon-commands";
import { compactDateTime } from "@/lib/format";
import { DaemonCommandDialog } from "./daemon-command-dialog";
import { nodeLabel } from "./resource-models";

/** paxl status and upgrade entry for the node detail page. */
export function NodePaxlUpgrade({
  node,
  userId,
}: {
  node: Node;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const installed = paxlObservation(node);
  const latestUpgrade = node.latest_daemon_commands?.find(
    (record) => record.type === "paxl.upgrade",
  );
  const running = latestUpgrade?.state === "in_progress";

  return (
    <div className="grid min-w-0 gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          title={
            [installed?.path, installed?.checked_at, installed?.error]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        >
          paxl {installed?.version ?? installed?.status ?? "not reported"}
          {!node.online && installed ? " · last observed" : ""}
        </span>
        <Button
          disabled={!node.online || installed?.status !== "installed"}
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
        >
          Upgrade paxl
        </Button>
      </div>
      {latestUpgrade && (
        <p
          className={
            latestUpgrade.state === "failed" ? "text-warning" : "text-ink-muted"
          }
          role="status"
        >
          {running && (
            <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />
          )}
          {latestUpgrade.state === "failed" && (
            <AlertCircle className="mr-1.5 inline h-3 w-3" />
          )}
          <span>
            {latestUpgrade.state === "succeeded"
              ? `paxl ${latestUpgrade.target_version} verified`
              : latestUpgrade.state === "failed"
                ? `paxl ${latestUpgrade.target_version} upgrade failed${latestUpgrade.error_message ? `: ${latestUpgrade.error_message}` : ""}`
                : `Upgrading paxl to ${latestUpgrade.target_version}`}
          </span>
          <span className="text-ink-tertiary">
            {" · "}
            {compactDateTime(
              latestUpgrade.completed_at ?? latestUpgrade.created_at,
            )}
          </span>
        </p>
      )}
      <PaxlUpgradeDialog
        node={node}
        onOpenChange={setOpen}
        open={open}
        resumeCommandId={running ? latestUpgrade.command_id : undefined}
        userId={userId}
      />
    </div>
  );
}

export function PaxlUpgradeDialog({
  node,
  onOpenChange,
  open,
  resumeCommandId,
  userId,
}: {
  node: Node;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  resumeCommandId?: string;
  userId: string;
}) {
  const installed = paxlObservation(node);
  const latest = useQuery({
    queryKey: ["paxl-release", node.os, node.arch, "stable"],
    queryFn: () => getLatestPaxlRelease(node.os!, node.arch!),
    enabled: open && Boolean(node.os && node.arch),
  });
  const latestVersion = latest.data?.version;

  return (
    <DaemonCommandDialog
      confirmBody={
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2.5">
            <span className="font-mono text-sm text-ink">
              {installed?.version ?? "Unknown"} →{" "}
              {latest.isError
                ? "Release check failed"
                : (latestVersion ?? "Checking stable release…")}
            </span>
            <span className="text-xs text-ink-tertiary">latest stable</span>
          </div>
          <p className="text-xs leading-5 text-ink-tertiary">
            New paxl invocations will use this version. Running processes
            continue; paxd stays connected.
          </p>
          {latest.error && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-warning" role="alert">
                {latest.error.message}
              </p>
              <Button
                disabled={latest.isFetching}
                onClick={() => void latest.refetch()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Retry release check
              </Button>
            </div>
          )}
        </div>
      }
      confirmDisabled={
        latest.isError ||
        latest.isFetching ||
        !latestVersion ||
        versionsEqual(latestVersion, installed?.version)
      }
      confirmLabel="Install paxl update"
      description={nodeLabel(node)}
      icon={<Download className="h-4 w-4" />}
      kind="paxl.upgrade"
      nodeId={node.node_id}
      onOpenChange={onOpenChange}
      open={open}
      resumeCommandId={resumeCommandId}
      submit={() => {
        if (!latestVersion) {
          return Promise.reject(
            new Error("No stable paxl release is available."),
          );
        }
        return upgradeNodePaxl(userId, node.node_id, {
          command_id: crypto.randomUUID(),
          version: latestVersion,
        });
      }}
      successText={(snapshot) =>
        `paxl ${snapshot.expectedVersion ?? latestVersion} verified`
      }
      title="Upgrade paxl"
      userId={userId}
    />
  );
}
