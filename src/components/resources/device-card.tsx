"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Download,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Settings2,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { supportsAgentSignIn } from "@/components/settings/agent-sign-in-settings";
import {
  agentTypeLabel,
  normalizeAgentType,
} from "@/components/settings/agent-types";
import { settingsLinks } from "@/components/settings/settings-catalog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/ui/status-dot";
import { TruncatedText } from "@/components/ui/text";
import {
  listNodeDaemonAgentConnections,
  restartNodeDaemonAgentConnection,
} from "@/features/api/resources";
import type { Agent, Node } from "@/features/api/types";
import {
  activeDeviceCommand,
  deviceCommandNote,
  DeviceCommandKind,
  paxlObservation,
} from "@/features/devices/daemon-commands";
import {
  useAgentSignInStates,
  type AgentSignInState,
} from "@/features/devices/use-agent-sign-in-states";
import { formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PaxdRestartDialog,
  PaxdUpgradeDialog,
} from "./node-maintenance-actions";
import { PaxlUpgradeDialog } from "./node-paxl-upgrade";
import { agentLabel, nodeLabel } from "./resource-models";

type OpenDialog = { kind: DeviceCommandKind; resumeCommandId?: string };

const osNames: Record<string, string> = {
  darwin: "macOS",
  linux: "Linux",
  windows: "Windows",
};

const dangerItem = "text-warning hover:text-warning focus:text-warning";

/**
 * One device with the agents that run on it. Everyone can rename, update and
 * delete; version details and the remaining maintenance stay with
 * administrators.
 */
export function DeviceCard({
  admin,
  agents,
  node,
  onAgentSettings,
  onDeleteAgent,
  onDeleteDevice,
  onRename,
  userId,
}: {
  admin: boolean;
  agents: Agent[];
  node: Node;
  onAgentSettings: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onDeleteDevice: (node: Node) => void;
  onRename: (node: Node) => void;
  userId: string;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<OpenDialog>();
  const label = nodeLabel(node);
  const online = Boolean(node.online);
  const note = deviceCommandNote(node);
  const commandName =
    note?.record.type === "paxd.restart"
      ? "paxd restart"
      : note?.record.type === "paxd.upgrade"
        ? "paxd upgrade"
        : "paxl upgrade";
  const noteText =
    note?.tone === "warning"
      ? t("{command} failed", { command: t(commandName) })
      : note?.record.type === "paxd.restart"
        ? t("Restarting paxd")
        : t(
            note?.record.type === "paxd.upgrade"
              ? "Upgrading paxd{target}"
              : "Upgrading paxl{target}",
            {
              target: note?.record.target_version
                ? ` → ${note.record.target_version}`
                : "",
            },
          );
  const offlineFor = online ? undefined : formatAge(node.last_heartbeat);
  const signInTypes = [
    ...new Set(
      agents
        .map((agent) => normalizeAgentType(agent.agent_type))
        .filter((type): type is string => !!type && supportsAgentSignIn(type)),
    ),
  ].sort();
  const signIn = useAgentSignInStates(
    userId,
    node.node_id,
    signInTypes,
    online,
  );
  const restart = useMutation({
    mutationFn: async (agent: Agent) => {
      const result = await listNodeDaemonAgentConnections(userId, node.node_id);
      const connection = result.agent_connections?.items.find(
        (item) => item.cloud_agent_id === agent.agent_id,
      );
      if (!connection)
        throw new Error(
          t("This agent's connection was not found on the device."),
        );
      return restartNodeDaemonAgentConnection(
        userId,
        node.node_id,
        connection.id,
      );
    },
  });

  function openDialog(kind: DeviceCommandKind, resumeCommandId?: string) {
    setDialog({
      kind,
      resumeCommandId:
        resumeCommandId ?? activeDeviceCommand(node, kind)?.command_id,
    });
  }

  const dialogProps = {
    nodeId: node.node_id,
    nodeLabel: label,
    onOpenChange: (open: boolean) => !open && setDialog(undefined),
    resumeCommandId: dialog?.resumeCommandId,
    userId,
  };

  return (
    <article
      aria-label={label}
      className="min-w-0 overflow-hidden rounded-lg border border-hairline bg-surface-1"
      data-testid="device-card"
    >
      <header className="grid min-w-0 gap-x-5 gap-y-2 border-b border-hairline bg-surface-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center sm:pl-4">
        <div className="col-start-1 row-start-1 grid min-w-0 gap-0.5">
          <span className="flex min-w-0 items-center gap-2.5">
            <StatusDot
              label={online ? t("online") : t("offline")}
              tone={online ? "success" : "neutral"}
            />
            <TruncatedText
              className={cn("text-sm font-medium", !online && "text-ink-muted")}
            >
              {label}
            </TruncatedText>
          </span>
          <span className="pl-[18px] text-xs text-ink-tertiary">
            {[
              node.os && (osNames[node.os.toLowerCase()] ?? node.os),
              online
                ? t("online")
                : offlineFor
                  ? t("offline {duration}", { duration: offlineFor })
                  : t("offline"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-col items-start gap-1 pl-[18px] text-xs sm:flex-row sm:items-center sm:justify-end sm:gap-5 sm:pl-0",
            !online && "opacity-60",
          )}
        >
          {note && (
            <button
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5 rounded-sm hover:underline",
                note.tone === "warning" ? "text-warning" : "text-ink-subtle",
              )}
              onClick={() =>
                openDialog(
                  note.record.type as DeviceCommandKind,
                  note.record.command_id,
                )
              }
              type="button"
            >
              {note.tone === "warning" ? (
                <AlertCircle
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                />
              ) : (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 animate-spin"
                />
              )}
              <span className="truncate">{noteText}</span>
            </button>
          )}
          {admin && (
            <div className="grid grid-cols-[6.5rem_7rem] items-center">
              <VersionLabel name="paxd" value={node.paxd_version} />
              <PaxlVersionLabel node={node} />
            </div>
          )}
        </div>

        <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("Actions for {value1}", { value1: label })}
                className="h-8 w-8"
                icon={<MoreHorizontal className="h-4 w-4" />}
                size="icon"
                type="button"
                variant="ghost"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuItem onSelect={() => onRename(node)}>
                <Pencil className="h-4 w-4" />
                {t("Rename…")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!online}
                onSelect={() => openDialog("paxd.upgrade")}
              >
                <Download className="h-4 w-4" />
                {t("Update PAX…")}
              </DropdownMenuItem>
              {admin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t("Administrator")}</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={!online}
                    onSelect={() => openDialog("paxd.restart")}
                  >
                    <RotateCw className="h-4 w-4" />
                    {t("Restart paxd…")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={
                      !online || paxlObservation(node)?.status !== "installed"
                    }
                    onSelect={() => openDialog("paxl.upgrade")}
                  >
                    <Download className="h-4 w-4" />
                    {t("Upgrade paxl…")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/nodes/${encodeURIComponent(node.node_id)}`}>
                      <Info className="h-4 w-4" />
                      {t("Runtime details")}
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={dangerItem}
                onSelect={() => onDeleteDevice(node)}
              >
                <Trash2 className="h-4 w-4" />
                {t("Delete device…")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {restart.error && (
        <p
          className="border-b border-hairline px-4 py-2 text-xs text-warning"
          role="alert"
        >
          {restart.error.message}
        </p>
      )}

      {agents.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {agents.map((agent) => (
            <AgentRow
              admin={admin}
              agent={agent}
              deviceOnline={online}
              key={agent.agent_id}
              nodeId={node.node_id}
              onDelete={onDeleteAgent}
              onRestart={restart.mutate}
              onSettings={onAgentSettings}
              restarting={
                restart.isPending &&
                restart.variables?.agent_id === agent.agent_id
              }
              signIn={signIn[normalizeAgentType(agent.agent_type) ?? ""]}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-ink-tertiary">
          {t("No agents on this device yet.")}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-2.5">
        {online ? (
          <Button asChild icon={<Plus className="h-4 w-4" />} size="sm">
            <Link
              href={`${settingsLinks.addAgent}?nodeId=${encodeURIComponent(node.node_id)}`}
            >
              {t("Add agent")}
            </Link>
          </Button>
        ) : (
          <>
            <Button
              disabled
              icon={<Plus className="h-4 w-4" />}
              size="sm"
              type="button"
            >
              {t("Add agent")}
            </Button>
            <span className="text-xs text-ink-tertiary">
              {t("Available when the device is online")}
            </span>
          </>
        )}
      </footer>

      <PaxdUpgradeDialog
        {...dialogProps}
        currentVersion={node.paxd_version}
        nodeArch={node.arch}
        nodeOS={node.os}
        open={dialog?.kind === "paxd.upgrade"}
      />
      <PaxdRestartDialog
        {...dialogProps}
        open={dialog?.kind === "paxd.restart"}
      />
      <PaxlUpgradeDialog
        node={node}
        onOpenChange={dialogProps.onOpenChange}
        open={dialog?.kind === "paxl.upgrade"}
        resumeCommandId={dialog?.resumeCommandId}
        userId={userId}
      />
    </article>
  );
}

/**
 * An agent with what a person needs to act on it: whether it can take work,
 * whether its account is signed in, and the few things they can change.
 */
export function AgentRow({
  admin,
  agent,
  deviceOnline,
  nodeId,
  onDelete,
  onRestart,
  onSettings,
  restarting,
  signIn,
}: {
  admin: boolean;
  agent: Agent;
  deviceOnline: boolean;
  nodeId?: string;
  onDelete: (agent: Agent) => void;
  onRestart?: (agent: Agent) => void;
  onSettings: (agent: Agent) => void;
  restarting?: boolean;
  signIn?: AgentSignInState;
}) {
  const { t } = useI18n();
  const type = normalizeAgentType(agent.agent_type);
  const typeName = type ? agentTypeLabel(type) : undefined;
  // An unnamed agent is known by its type, such as "Claude Code".
  const label = agent.name?.trim() || typeName || agentLabel(agent);
  const detail = [typeName !== label && typeName, agent.description]
    .filter(Boolean)
    .join(" · ");
  const available = deviceOnline && Boolean(agent.online);
  const signInHref =
    nodeId && type && supportsAgentSignIn(type)
      ? `${settingsLinks.agentSignIn}?${new URLSearchParams({ node_id: nodeId, harness: type })}`
      : undefined;
  return (
    <li
      className="grid min-w-0 gap-x-5 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center"
      data-testid="agent-row"
    >
      <div className="col-start-1 row-start-1 min-w-0">
        <TruncatedText className="text-sm font-medium">{label}</TruncatedText>
        {detail && (
          <TruncatedText className="mt-0.5 text-xs text-ink-tertiary">
            {detail}
          </TruncatedText>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          {restarting ? (
            <Loader2
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin"
            />
          ) : (
            <StatusDot
              label={available ? t("online") : t("offline")}
              tone={available ? "success" : "neutral"}
            />
          )}
          {restarting
            ? t("Restarting…")
            : available
              ? t("Available")
              : t("Offline")}
        </span>
        {signIn === "signed-in" && (
          <span className="text-ink-tertiary">{t("Signed in")}</span>
        )}
        {signIn === "signed-out" && signInHref && (
          <span className="text-warning">
            {t("Sign-in needed")}{" "}
            <Link className="underline" href={signInHref}>
              {t("Sign in")}
            </Link>
          </span>
        )}
      </div>
      <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("Actions for {value1}", { value1: label })}
              className="h-8 w-8"
              icon={<MoreHorizontal className="h-4 w-4" />}
              size="icon"
              type="button"
              variant="ghost"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            <DropdownMenuItem onSelect={() => onSettings(agent)}>
              <Settings2 className="h-4 w-4" />
              {t("Settings…")}
            </DropdownMenuItem>
            {signInHref && (
              <DropdownMenuItem asChild>
                <Link href={signInHref}>
                  <UserRoundCheck className="h-4 w-4" />
                  {t("Sign-in & usage")}
                </Link>
              </DropdownMenuItem>
            )}
            {onRestart && (
              <DropdownMenuItem
                disabled={!deviceOnline || restarting}
                onSelect={() => onRestart(agent)}
              >
                <RotateCw className="h-4 w-4" />
                {t("Restart")}
              </DropdownMenuItem>
            )}
            {admin && (
              <DropdownMenuItem asChild>
                <Link
                  href={`/agents/${encodeURIComponent(agent.agent_id)}${nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : ""}`}
                >
                  <Info className="h-4 w-4" />
                  {t("Runtime details")}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={dangerItem}
              onSelect={() => onDelete(agent)}
            >
              <Trash2 className="h-4 w-4" />
              {t("Delete agent…")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function VersionLabel({ name, value }: { name: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-ink-tertiary">{name}</span>
      <span className="font-mono text-ink-muted">{value || "—"}</span>
    </span>
  );
}

function PaxlVersionLabel({ node }: { node: Node }) {
  const { t } = useI18n();
  const paxl = paxlObservation(node);
  if (paxl && paxl.status !== "installed") {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        title={paxl.error}
      >
        <span className="text-ink-tertiary">{t("paxl")}</span>
        <span className="inline-flex items-center gap-1 text-warning">
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
          {t(paxl.status.replaceAll("_", " "))}
        </span>
      </span>
    );
  }
  return <VersionLabel name="paxl" value={paxl?.version} />;
}
