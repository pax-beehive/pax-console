"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { useState } from "react";
import { AlertCircle, Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  restartNodeDaemon,
  upgradeNodeDaemon,
  useLatestPaxdRelease,
} from "@/features/api/resources";
import { versionsEqual } from "@/features/devices/daemon-commands";
import { DaemonCommandDialog } from "./daemon-command-dialog";

type NodeMaintenanceActionsProps = {
  currentVersion?: string;
  disabled?: boolean;
  nodeArch?: string;
  nodeId: string;
  nodeLabel: string;
  nodeOS?: string;
  userId: string;
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
  const { t } = useI18n();
  const [restartOpen, setRestartOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="flex items-start justify-end gap-1">
      <Button
        aria-label={t("Upgrade paxd immediately")}
        disabled={disabled}
        icon={<Download className="h-4 w-4" />}
        onClick={() => setUpgradeOpen(true)}
        size="icon"
        tooltip={t("Upgrade paxd immediately")}
        type="button"
        variant="ghost"
      />
      <Button
        aria-label={t("Restart paxd immediately")}
        disabled={disabled}
        icon={<RotateCw className="h-4 w-4" />}
        onClick={() => setRestartOpen(true)}
        size="icon"
        tooltip={t("Restart paxd immediately")}
        type="button"
        variant="danger"
      />
      <PaxdRestartDialog
        nodeId={nodeId}
        nodeLabel={nodeLabel}
        onOpenChange={setRestartOpen}
        open={restartOpen}
        userId={userId}
      />
      <PaxdUpgradeDialog
        currentVersion={currentVersion}
        nodeArch={nodeArch}
        nodeId={nodeId}
        nodeLabel={nodeLabel}
        nodeOS={nodeOS}
        onOpenChange={setUpgradeOpen}
        open={upgradeOpen}
        userId={userId}
      />
    </div>
  );
}

type MaintenanceDialogProps = {
  nodeId: string;
  nodeLabel: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  resumeCommandId?: string;
  userId: string;
};

export function PaxdRestartDialog({
  nodeId,
  nodeLabel,
  onOpenChange,
  open,
  resumeCommandId,
  userId,
}: MaintenanceDialogProps) {
  const { t } = useI18n();
  return (
    <DaemonCommandDialog
      confirmBody={
        <div className="grid gap-2">
          <p>
            {t(
              "The node will disconnect briefly while its service supervisor starts a new paxd process.",
            )}
          </p>
          <p className="text-warning">
            {t("Immediate mode can interrupt active agent work on this node.")}
          </p>
        </div>
      }
      confirmLabel={t("Restart immediately")}
      description={nodeLabel}
      icon={<RotateCw className="h-4 w-4" />}
      kind="paxd.restart"
      nodeId={nodeId}
      onOpenChange={onOpenChange}
      open={open}
      resumeCommandId={resumeCommandId}
      submit={() => restartNodeDaemon(userId, nodeId)}
      successText={() => t("paxd restarted and is back online.")}
      title={t("Restart paxd")}
      userId={userId}
    />
  );
}

export function PaxdUpgradeDialog({
  currentVersion,
  nodeArch,
  nodeOS,
  ...props
}: MaintenanceDialogProps & {
  currentVersion?: string;
  nodeArch?: string;
  nodeOS?: string;
}) {
  const { t } = useI18n();
  const latestRelease = useLatestPaxdRelease(nodeOS, nodeArch, props.open);
  const latestVersion = latestRelease.data?.version.trim();
  const platformKnown = Boolean(nodeOS && nodeArch);
  const upToDate = versionsEqual(currentVersion, latestVersion);
  const canUpgrade =
    platformKnown &&
    Boolean(latestVersion) &&
    !latestRelease.error &&
    !latestRelease.isLoading &&
    !upToDate;

  return (
    <DaemonCommandDialog
      {...props}
      confirmBody={
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-hairline bg-canvas px-3 py-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-tertiary">
                {t("Latest stable version")}
              </span>
              <span className="font-mono text-sm text-ink">
                {latestRelease.isLoading
                  ? t("checking...")
                  : latestVersion || t("unavailable")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-tertiary">{t("Platform")}</span>
              <span className="font-mono text-ink-muted">
                {latestRelease.data?.platform || t("unknown")}
              </span>
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-tertiary">
            {t(
              "Current version: {version}. The node disconnects while its service supervisor starts the new version, which can interrupt active agent work.",
              { version: currentVersion || t("unknown") },
            )}
          </p>
          {!platformKnown && (
            <InlineWarning
              message={t("This node did not report its OS and architecture.")}
            />
          )}
          {latestRelease.error && (
            <InlineWarning message={latestRelease.error.message} />
          )}
          {upToDate && (
            <p className="text-xs text-success">{t("paxd is up to date.")}</p>
          )}
        </div>
      }
      confirmDisabled={!canUpgrade}
      confirmLabel={
        latestRelease.isLoading
          ? t("Checking release...")
          : upToDate
            ? t("Already up to date")
            : t("Upgrade immediately")
      }
      description={props.nodeLabel}
      icon={<Download className="h-4 w-4" />}
      kind="paxd.upgrade"
      submit={() => {
        if (!latestVersion) {
          return Promise.reject(
            new Error(t("No stable paxd release is available for this node.")),
          );
        }
        return upgradeNodeDaemon(props.userId, props.nodeId, {
          version: latestVersion,
        });
      }}
      successText={(snapshot) =>
        t("paxd {version} is running.", {
          version:
            snapshot.observedVersion ||
            snapshot.expectedVersion ||
            t("upgrade"),
        })
      }
      title={t("Upgrade paxd")}
    />
  );
}

function InlineWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning bg-canvas px-3 py-2 text-xs text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <span>{message}</span>
    </div>
  );
}
