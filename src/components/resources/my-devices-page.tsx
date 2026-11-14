"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  settingsLinks,
  settingsSection,
} from "@/components/settings/settings-catalog";
import {
  SettingsBack,
  SettingsPageHeader,
} from "@/components/settings/settings-navigation";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form-controls";
import { queryKeys } from "@/features/api/query-keys";
import {
  deleteAgent,
  deleteNode,
  updateNodeProfile,
  useAgents,
  useNodes,
} from "@/features/api/resources";
import type { Agent, Node, User } from "@/features/api/types";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useConsoleStore } from "@/stores/console-store";
import { AgentSettingsDialog } from "./agent-settings-dialog";
import { AgentRow, DeviceCard } from "./device-card";
import { agentLabel, isDeviceNode, nodeLabel } from "./resource-models";

type Pending =
  | { kind: "rename"; node: Node }
  | { kind: "delete-device"; node: Node }
  | { kind: "delete-agent"; agent: Agent }
  | { kind: "agent-settings"; agent: Agent };

/**
 * Every device with the agents that run on it. An offline device stays
 * listed, after the ones that are online.
 */
export function MyDevicesPage({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const userId = user.user_id;
  const section = settingsSection("devices");
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const admin = canSeeAdminFeatures(user, previewAsUser);
  const nodesQuery = useNodes(userId);
  const agentsQuery = useAgents(userId, "owned");
  const [pending, setPending] = useState<Pending>();
  const close = () => setPending(undefined);

  const { devices, agentsByDevice, otherAgents } = useMemo(() => {
    const devices = (nodesQuery.data?.nodes ?? [])
      .filter(isDeviceNode)
      .sort(
        (a, b) =>
          Number(Boolean(b.online)) - Number(Boolean(a.online)) ||
          nodeLabel(a).localeCompare(nodeLabel(b)),
      );
    const known = new Set(devices.map((node) => node.node_id));
    const agentsByDevice = new Map<string, Agent[]>();
    const otherAgents: Agent[] = [];
    for (const agent of [...(agentsQuery.data?.agents ?? [])].sort((a, b) =>
      agentLabel(a).localeCompare(agentLabel(b)),
    )) {
      if (agent.node_id && known.has(agent.node_id))
        agentsByDevice.set(agent.node_id, [
          ...(agentsByDevice.get(agent.node_id) ?? []),
          agent,
        ]);
      else otherAgents.push(agent);
    }
    return { devices, agentsByDevice, otherAgents };
  }, [agentsQuery.data, nodesQuery.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.user(userId) });
    close();
  };
  const removeDevice = useMutation({
    mutationFn: (node: Node) => deleteNode(userId, node.node_id),
    onSuccess: refresh,
  });
  const removeAgent = useMutation({
    mutationFn: (agent: Agent) => deleteAgent(userId, agent.agent_id),
    onSuccess: refresh,
  });
  const error =
    nodesQuery.error ??
    agentsQuery.error ??
    removeDevice.error ??
    removeAgent.error;
  const rowActions = {
    onDelete: (agent: Agent) => setPending({ kind: "delete-agent", agent }),
    onSettings: (agent: Agent) => setPending({ kind: "agent-settings", agent }),
  };

  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 flex-1 flex-col">
        <SettingsPageHeader
          category={section.category}
          description={section.description}
          mobileHeading={
            <>
              <SettingsBack />
              <h1 className="text-2xl font-semibold">{t(section.title)}</h1>
              <p className="mt-2 text-sm text-ink-tertiary">
                {t(section.caption)}
              </p>
            </>
          }
          title={section.title}
        >
          <Button asChild icon={<Plus className="h-4 w-4" />} variant="primary">
            <Link href={settingsLinks.addDevice}>{t("Add device")}</Link>
          </Button>
        </SettingsPageHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 lg:px-8 lg:py-6">
          <div className="mx-auto grid w-full max-w-5xl gap-4">
            {error && (
              <p className="text-sm text-warning" role="alert">
                {error.message}
              </p>
            )}
            {nodesQuery.isLoading ? (
              <EmptyState label={t("Loading devices")} />
            ) : devices.length === 0 && otherAgents.length === 0 ? (
              <section className="grid justify-items-start gap-3 rounded-lg border border-dashed border-hairline bg-surface-1 p-5">
                <h2 className="font-medium">{t("No devices yet")}</h2>
                <p className="text-sm text-ink-tertiary">
                  {t(
                    "Connect a computer or server, then add the agents you want to work with on it.",
                  )}
                </p>
                <Button
                  asChild
                  icon={<Plus className="h-4 w-4" />}
                  variant="primary"
                >
                  <Link href={settingsLinks.addDevice}>{t("Add device")}</Link>
                </Button>
              </section>
            ) : (
              devices.map((node) => (
                <DeviceCard
                  admin={admin}
                  agents={agentsByDevice.get(node.node_id) ?? []}
                  key={node.node_id}
                  node={node}
                  onAgentSettings={rowActions.onSettings}
                  onDeleteAgent={rowActions.onDelete}
                  onDeleteDevice={(node) =>
                    setPending({ kind: "delete-device", node })
                  }
                  onRename={(node) => setPending({ kind: "rename", node })}
                  userId={userId}
                />
              ))
            )}
            {otherAgents.length > 0 && (
              <section
                aria-label={t("Agents without a device")}
                className="min-w-0 overflow-hidden rounded-lg border border-hairline bg-surface-1"
              >
                <h2 className="border-b border-hairline bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-muted">
                  {t("Agents without a device")}
                </h2>
                <ul className="divide-y divide-hairline">
                  {otherAgents.map((agent) => (
                    <AgentRow
                      admin={admin}
                      agent={agent}
                      deviceOnline={false}
                      key={agent.agent_id}
                      nodeId={agent.node_id}
                      {...rowActions}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      {pending?.kind === "rename" && (
        <RenameDeviceDialog
          key={pending.node.node_id}
          node={pending.node}
          onClose={close}
          userId={userId}
        />
      )}
      {pending?.kind === "agent-settings" && (
        <AgentSettingsDialog
          agent={pending.agent}
          key={pending.agent.agent_id}
          node={devices.find((node) => node.node_id === pending.agent.node_id)}
          onClose={close}
          userId={userId}
        />
      )}
      <ConfirmDialog
        confirmLabel={
          removeDevice.isPending ? t("Deleting...") : t("Delete device")
        }
        description={
          <>
            {t("This removes")}{" "}
            <span className="font-medium text-ink">
              {pending?.kind === "delete-device" ? nodeLabel(pending.node) : ""}
            </span>{" "}
            {t("from PAX, together with the agents that run on it.")}
          </>
        }
        disabled={removeDevice.isPending}
        onConfirm={() => {
          if (pending?.kind === "delete-device")
            removeDevice.mutate(pending.node);
        }}
        onOpenChange={(open) => !open && close()}
        open={pending?.kind === "delete-device"}
        title={t("Delete device?")}
      />
      <ConfirmDialog
        confirmLabel={
          removeAgent.isPending ? t("Deleting...") : t("Delete agent")
        }
        description={
          <>
            {t("This removes")}{" "}
            <span className="font-medium text-ink">
              {pending?.kind === "delete-agent"
                ? agentLabel(pending.agent)
                : ""}
            </span>{" "}
            {t("from PAX. Other agents on the same device are not affected.")}
          </>
        }
        disabled={removeAgent.isPending}
        onConfirm={() => {
          if (pending?.kind === "delete-agent")
            removeAgent.mutate(pending.agent);
        }}
        onOpenChange={(open) => !open && close()}
        open={pending?.kind === "delete-agent"}
        title={t("Delete agent?")}
      />
    </ConsoleLayout>
  );
}

function RenameDeviceDialog({
  node,
  onClose,
  userId,
}: {
  node: Node;
  onClose: () => void;
  userId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(nodeLabel(node));
  const next = name.trim();
  const rename = useMutation({
    mutationFn: () => updateNodeProfile(userId, node.node_id, { name: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.user(userId) });
      onClose();
    },
  });
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogHeader title={t("Rename device")} />
      <DialogBody>
        <form
          id="rename-device"
          onSubmit={(event) => {
            event.preventDefault();
            if (next && next !== nodeLabel(node)) rename.mutate();
          }}
        >
          <Input
            aria-label={t("Device name")}
            autoFocus
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </form>
        {rename.error && (
          <p className="mt-2 text-warning" role="alert">
            {rename.error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="ghost">
          {t("Cancel")}
        </Button>
        <Button
          disabled={!next || next === nodeLabel(node) || rename.isPending}
          form="rename-device"
          type="submit"
          variant="primary"
        >
          {rename.isPending ? t("Saving...") : t("Save")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
