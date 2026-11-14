"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentTypeLabel,
  normalizeAgentType,
} from "@/components/settings/agent-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/features/api/query-keys";
import {
  updateNodeAgentProfile,
  updateNodeDaemonAgentConnection,
  useNodeDaemonAgentConnections,
} from "@/features/api/resources";
import type { Agent, Node } from "@/features/api/types";
import { nodeLabel } from "./resource-models";

const maxSlots = 16;

/**
 * The few agent settings that have an effect: its name, the description other
 * agents read, whether sessions started on the device are synced, and how
 * many sessions it runs at once. The last two live on the device, so they can
 * only be changed while it is online.
 */
export function AgentSettingsDialog({
  agent,
  node,
  onClose,
  userId,
}: {
  agent: Agent;
  node?: Node;
  onClose: () => void;
  userId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const nodeId = node?.node_id ?? agent.node_id;
  const online = Boolean(node?.online);
  const [name, setName] = useState(agent.name ?? "");
  const [description, setDescription] = useState(agent.description ?? "");
  const [syncDraft, setSyncDraft] = useState<boolean>();
  const [slotsDraft, setSlotsDraft] = useState<number>();
  const connections = useNodeDaemonAgentConnections(
    userId,
    node?.node_id,
    online,
  );
  const connection = connections.data?.agent_connections?.items.find(
    (item) => item.cloud_agent_id === agent.agent_id,
  );
  const savedSync = connection?.report_local_sessions ?? false;
  const sync = syncDraft ?? savedSync;
  const slots = slotsDraft ?? connection?.desired_acp_slots ?? 1;
  const slotsValid = Number.isInteger(slots) && slots >= 1 && slots <= maxSlots;
  const nextName = name.trim();
  const nextDescription = description.trim();
  const profileChanged =
    nextName !== (agent.name ?? "") ||
    (nextDescription !== "" && nextDescription !== (agent.description ?? ""));
  const deviceChanged =
    !!connection &&
    (sync !== savedSync || slots !== connection.desired_acp_slots);
  const type = normalizeAgentType(agent.agent_type);

  const save = useMutation({
    mutationFn: async () => {
      if (!nodeId) return;
      if (profileChanged)
        await updateNodeAgentProfile(userId, nodeId, agent.agent_id, {
          name: nextName,
          description: nextDescription,
        });
      if (connection && deviceChanged)
        await updateNodeDaemonAgentConnection(userId, nodeId, connection.id, {
          desired_slots: slots,
          harness: connection.harness,
          name: connection.name,
          report_local_sessions: sync,
          working_dir: connection.working_dir,
        });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.user(userId) });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogHeader
        description={[type && agentTypeLabel(type), node && nodeLabel(node)]
          .filter(Boolean)
          .join(" · ")}
        title={t("Agent settings")}
      />
      <DialogBody className="grid gap-4">
        <Field label={t("Name")}>
          <Input
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </Field>
        <Field
          hint={
            agent.description && !nextDescription
              ? t(
                  "A description cannot be removed yet. The current one stays until you replace it.",
                )
              : t("Your other agents read this when they look for help.")
          }
          label={t("Description (optional)")}
        >
          <Input
            maxLength={240}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </Field>
        <div className="flex items-start gap-3 rounded-md border border-hairline bg-surface-1 px-3 py-2.5">
          <Switch
            aria-label={t("Sync local sessions")}
            checked={sync}
            className="mt-0.5"
            disabled={!connection}
            onCheckedChange={setSyncDraft}
          />
          <span className="grid gap-0.5">
            <span className="text-ink">{t("Sync local sessions")}</span>
            <span className="text-xs leading-5">
              {t(
                "Sessions started on this device outside PAX also appear in PAX. When off, only sessions started from PAX are synced.",
              )}
            </span>
          </span>
        </div>
        <details className="rounded-md border border-hairline px-3 py-2.5">
          <summary className="cursor-pointer text-ink-subtle">
            {t("Advanced")}
          </summary>
          <div className="mt-3">
            <Field
              hint={t("From 1 to {max}.", { max: maxSlots })}
              label={t("Sessions running at the same time")}
            >
              <Input
                className="w-24"
                disabled={!connection}
                max={maxSlots}
                min={1}
                onChange={(event) =>
                  setSlotsDraft(Number.parseInt(event.target.value, 10))
                }
                type="number"
                value={Number.isNaN(slots) ? "" : slots}
              />
            </Field>
          </div>
        </details>
        {!connection && (
          <p className="text-xs">
            {!online
              ? t(
                  "Syncing and the session limit can be changed when the device is online.",
                )
              : connections.isLoading
                ? t("Loading the device's settings…")
                : t(
                    "Syncing and the session limit are not available for this agent.",
                  )}
          </p>
        )}
        {save.error && (
          <p className="text-warning" role="alert">
            {save.error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="ghost">
          {t("Cancel")}
        </Button>
        <Button
          disabled={
            !nodeId ||
            !nextName ||
            !slotsValid ||
            save.isPending ||
            (!profileChanged && !deviceChanged)
          }
          onClick={() => save.mutate()}
          type="button"
          variant="primary"
        >
          {save.isPending ? t("Saving...") : t("Save")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  // The hint sits outside the label so the control is named by its label only.
  return (
    <div className="grid gap-1.5">
      <label className="grid gap-1.5">
        <span className="text-xs text-ink-subtle">{label}</span>
        {children}
      </label>
      {hint && <span className="text-xs text-ink-tertiary">{hint}</span>}
    </div>
  );
}
