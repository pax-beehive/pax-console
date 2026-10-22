"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  Download,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/ui/status-dot";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { Node } from "@/features/api/types";
import {
  activeDeviceCommand,
  deviceCommandNote,
  DeviceCommandKind,
  paxlObservation,
} from "@/features/devices/daemon-commands";
import { compactId, formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PaxdRestartDialog,
  PaxdUpgradeDialog,
} from "./node-maintenance-actions";
import { PaxlUpgradeDialog } from "./node-paxl-upgrade";
import { nodeLabel } from "./resource-models";

type OpenDialog = { kind: DeviceCommandKind; resumeCommandId?: string };

export function NodeListRow({
  deleting,
  node,
  onDelete,
  userId,
}: {
  deleting: boolean;
  node: Node;
  onDelete: (node: Node) => void;
  userId: string;
}) {
  const [dialog, setDialog] = useState<OpenDialog>();
  const label = nodeLabel(node);
  const online = Boolean(node.online);
  const note = deviceCommandNote(node);
  const offlineFor = online ? undefined : formatAge(node.last_heartbeat);

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
      className="grid min-w-0 gap-x-5 gap-y-2 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center sm:pl-4"
      data-testid="node-row"
    >
      <Link
        className="col-start-1 row-start-1 grid min-w-0 gap-0.5"
        href={`/nodes/${node.node_id}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <StatusDot
            label={online ? "online" : "offline"}
            tone={online ? "success" : "neutral"}
          />
          <TruncatedText
            className={cn("text-sm font-medium", !online && "text-ink-muted")}
          >
            {label}
          </TruncatedText>
        </span>
        <MonoId className="pl-[18px]" tooltip={node.node_id}>
          {[
            `${node.os ?? "unknown os"}/${node.arch ?? "unknown arch"}`,
            compactId(node.node_id),
            offlineFor && `offline ${offlineFor}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </MonoId>
      </Link>

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
            <span className="truncate">{note.text}</span>
          </button>
        )}
        {/* Fixed columns keep versions aligned across rows. */}
        <div className="grid grid-cols-[6.5rem_7rem] items-center">
          <VersionLabel name="paxd" value={node.paxd_version} />
          <PaxlVersionLabel node={node} />
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${label}`}
              className="h-8 w-8"
              icon={<MoreHorizontal className="h-4 w-4" />}
              size="icon"
              type="button"
              variant="ghost"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            <MenuLabel>paxd</MenuLabel>
            <DropdownMenuItem
              disabled={!online}
              onSelect={() => openDialog("paxd.upgrade")}
            >
              <Download className="h-4 w-4" />
              Upgrade paxd…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!online}
              onSelect={() => openDialog("paxd.restart")}
            >
              <RotateCw className="h-4 w-4" />
              Restart paxd…
            </DropdownMenuItem>
            <MenuSeparator />
            <MenuLabel>paxl</MenuLabel>
            <DropdownMenuItem
              disabled={
                !online || paxlObservation(node)?.status !== "installed"
              }
              onSelect={() => openDialog("paxl.upgrade")}
            >
              <Download className="h-4 w-4" />
              Upgrade paxl…
            </DropdownMenuItem>
            <MenuSeparator />
            <DropdownMenuItem
              className="text-warning hover:text-warning focus:text-warning"
              disabled={deleting}
              onSelect={() => onDelete(node)}
            >
              <Trash2 className="h-4 w-4" />
              Delete device…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

function VersionLabel({ name, value }: { name: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-ink-tertiary">{name}</span>
      <span className="font-mono text-ink-muted">{value || "—"}</span>
    </span>
  );
}

function PaxlVersionLabel({ node }: { node: Node }) {
  const paxl = paxlObservation(node);
  if (paxl && paxl.status !== "installed") {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        title={paxl.error}
      >
        <span className="text-ink-tertiary">paxl</span>
        <span className="inline-flex items-center gap-1 text-warning">
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
          {paxl.status.replaceAll("_", " ")}
        </span>
      </span>
    );
  }
  return <VersionLabel name="paxl" value={paxl?.version} />;
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] text-ink-tertiary">
      {children}
    </div>
  );
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-hairline" role="separator" />;
}
