"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  ScanSearch,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { queryKeys } from "@/features/api/query-keys";
import {
  createNodeDaemonAgentConnection,
  discoverNodeDaemonHarnesses,
  removeNodeDaemonAgentConnection,
  restartNodeDaemonAgentConnection,
  startNodeDaemonAgentConnection,
  stopNodeDaemonAgentConnection,
  updateNodeDaemonAgentConnection,
  useNodeDaemonAgentConnections,
  useNodeDaemonHarnesses,
  useNodeDaemonStatus,
} from "@/features/api/resources";
import {
  NodeDaemonAgentConnection,
  NodeDaemonCommandData,
  NodeDaemonHarness,
} from "@/features/api/types";
import { compactId } from "@/lib/format";
import {
  nodeDaemonRuntimeOutcome,
  NodeDaemonRuntimeTarget,
} from "./resource-models";

type NodeDaemonControlProps = {
  nodeId: string;
  userId: string;
};

type ConnectionAction = "remove" | "restart" | "start" | "stop";

type LastDaemonCommand = {
  id: string;
  runtime?: NodeDaemonRuntimeTarget;
  status: string;
};

export function NodeDaemonControl({ nodeId, userId }: NodeDaemonControlProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<NodeDaemonAgentConnection>();
  const [removeTarget, setRemoveTarget] = useState<NodeDaemonAgentConnection>();
  const [lastCommand, setLastCommand] = useState<LastDaemonCommand>();
  const [inventoryNodeId, setInventoryNodeId] = useState<string>();
  const runtimeTarget = lastCommand?.runtime;

  // paxd intentionally permits only one query request/response at a time, so
  // initial reads are enabled in sequence instead of firing in parallel.
  const statusQuery = useNodeDaemonStatus(userId, nodeId);
  const harnessesQuery = useNodeDaemonHarnesses(
    userId,
    nodeId,
    statusQuery.isSuccess,
  );
  const connectionsQuery = useNodeDaemonAgentConnections(
    userId,
    nodeId,
    harnessesQuery.isSuccess,
    runtimeTarget
      ? (connections) => !nodeDaemonRuntimeOutcome(runtimeTarget, connections)
      : undefined,
  );
  const connections = connectionsQuery.data?.agent_connections?.items ?? [];
  const runtimeOutcome = runtimeTarget
    ? nodeDaemonRuntimeOutcome(runtimeTarget, connections)
    : undefined;
  const controlQueryBusy =
    statusQuery.isFetching ||
    harnessesQuery.isFetching ||
    connectionsQuery.isFetching;
  const runtimeReconciling = Boolean(
    lastCommand?.runtime &&
    !runtimeOutcome &&
    !connectionsQuery.error &&
    !connectionsQuery.data?.error,
  );

  useEffect(() => {
    if (!lastCommand?.id || !runtimeOutcome) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: queryKeys.agents(userId, nodeId),
    });
  }, [lastCommand?.id, nodeId, queryClient, runtimeOutcome, userId]);

  const recordCommand = (
    data: NodeDaemonCommandData,
    action: NodeDaemonRuntimeTarget["action"],
    fallbackConnectionId?: string,
    desiredRestartNonce?: number,
    expectedPhase?: NodeDaemonRuntimeTarget["expectedPhase"],
  ) => {
    const connectionId = data.connection_id ?? fallbackConnectionId;
    setLastCommand({
      id: data.command_id,
      runtime: connectionId
        ? {
            action,
            connectionId,
            desiredGeneration: data.desired_generation,
            desiredRestartNonce,
            expectedPhase,
          }
        : undefined,
      status: data.command_status ?? "received",
    });
  };

  const create = useMutation({
    mutationFn: (input: {
      agent_type: string;
      desired_slots: number;
      harness: string;
      instance_id?: string;
      name: string;
      working_dir?: string;
    }) => createNodeDaemonAgentConnection(userId, nodeId, input),
    onSuccess: (data) => {
      setCreateOpen(false);
      recordCommand(data, "create");
    },
  });
  const discover = useMutation({
    mutationFn: () =>
      discoverNodeDaemonHarnesses(userId, nodeId, { probe: true }),
    onSuccess: async (data) => {
      queryClient.setQueryData(
        queryKeys.nodeDaemonHarnesses(userId, nodeId),
        data,
      );
      setInventoryNodeId(nodeId);
      await connectionsQuery.refetch();
    },
  });
  const update = useMutation({
    mutationFn: (input: {
      connectionId: string;
      desired_slots: number;
      harness: string;
      name: string;
      working_dir?: string;
    }) =>
      updateNodeDaemonAgentConnection(userId, nodeId, input.connectionId, {
        harness: input.harness,
        name: input.name,
        working_dir: input.working_dir,
        desired_slots: input.desired_slots,
      }),
    onSuccess: async (data, input) => {
      setEditing(undefined);
      const connection = connections.find(
        (item) => item.id === input.connectionId,
      );
      recordCommand(
        data,
        "update",
        input.connectionId,
        undefined,
        connection?.desired_state === "stopped" ? "stopped" : "running",
      );
      await connectionsQuery.refetch();
    },
  });
  const action = useMutation({
    mutationFn: ({
      connection,
      type,
    }: {
      connection: NodeDaemonAgentConnection;
      type: ConnectionAction;
    }) => runConnectionAction(type, userId, nodeId, connection.id),
    onSuccess: (data, { connection, type }) => {
      setRemoveTarget(undefined);
      recordCommand(
        data,
        type,
        connection.id,
        type === "restart" ? connection.restart_nonce + 1 : undefined,
      );
    },
  });

  const harnesses = harnessesQuery.data?.harnesses?.items ?? [];
  const phase = statusQuery.data?.status?.phase;
  const queryError =
    statusQuery.error ?? harnessesQuery.error ?? connectionsQuery.error;
  const controlError =
    statusQuery.data?.error ??
    harnessesQuery.data?.error ??
    connectionsQuery.data?.error;
  const mutationError =
    create.error ?? discover.error ?? update.error ?? action.error;

  const refresh = async () => {
    await statusQuery.refetch();
    await harnessesQuery.refetch();
    await connectionsQuery.refetch();
    await queryClient.invalidateQueries({
      queryKey: queryKeys.agents(userId, nodeId),
    });
  };

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-base font-medium">paxd agent control</h2>
          <Badge tone={phase === "running" ? "success" : "neutral"}>
            {phase ?? (statusQuery.isLoading ? "checking" : "unavailable")}
          </Badge>
          <span className="text-xs text-ink-tertiary">
            {connections.length} connections
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={controlQueryBusy}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void refresh()}
            size="icon"
            tooltip="Refresh paxd control state"
            type="button"
            variant="ghost"
          />
          <Button
            disabled={
              discover.isPending || controlQueryBusy || runtimeReconciling
            }
            icon={<ScanSearch className="h-4 w-4" />}
            onClick={() => discover.mutate()}
            size="sm"
            tooltip="Probe this node for installed agent harnesses"
            type="button"
          >
            {discover.isPending ? "Discovering..." : "Discover"}
          </Button>
          <Button
            disabled={
              !harnesses.length ||
              runtimeReconciling ||
              controlQueryBusy ||
              discover.isPending
            }
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen((open) => !open)}
            size="sm"
            type="button"
            variant="primary"
          >
            New agent
          </Button>
        </div>
      </div>

      <p className="text-sm leading-6 text-ink-muted">
        Create and reconcile paxd-managed agent connections over this
        node&apos;s control tunnel.
      </p>

      {(queryError || controlError || mutationError) && (
        <div className="rounded-md border border-warning bg-canvas px-3 py-2 text-xs text-ink-muted">
          {queryError?.message ??
            controlError?.message ??
            mutationError?.message ??
            "Daemon control request failed."}
        </div>
      )}

      {createOpen && (
        <CreateConnectionForm
          disabled={create.isPending || controlQueryBusy}
          harnesses={harnesses}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      )}

      {lastCommand && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2">
          <span className="text-xs text-ink-tertiary">Last command</span>
          <MonoId tooltip={lastCommand.id}>{compactId(lastCommand.id)}</MonoId>
          <Badge tone={commandTone(lastCommand.status)}>
            command {lastCommand.status}
          </Badge>
          {lastCommand.runtime && (
            <Badge tone={runtimeTone(runtimeOutcome)}>
              runtime {runtimeOutcome ?? "reconciling"}
            </Badge>
          )}
        </div>
      )}

      <div className="grid min-w-0 overflow-hidden rounded-md border border-hairline">
        {connections.map((connection) =>
          editing?.id === connection.id ? (
            <EditConnectionForm
              connection={connection}
              disabled={update.isPending}
              harnesses={harnesses}
              key={connection.id}
              onCancel={() => setEditing(undefined)}
              onSubmit={(input) =>
                update.mutate({ connectionId: connection.id, ...input })
              }
            />
          ) : (
            <ConnectionRow
              busy={action.isPending || runtimeReconciling || controlQueryBusy}
              connection={connection}
              key={connection.id}
              onEdit={() => setEditing(connection)}
              onRemove={() => setRemoveTarget(connection)}
              onRestart={() => action.mutate({ connection, type: "restart" })}
              onStart={() => action.mutate({ connection, type: "start" })}
              onStop={() => action.mutate({ connection, type: "stop" })}
            />
          ),
        )}
        {!connectionsQuery.isLoading && connections.length === 0 && (
          <div className="bg-canvas px-3 py-5 text-center text-sm text-ink-tertiary">
            No paxd-managed agent connections.
          </div>
        )}
        {connectionsQuery.isLoading && (
          <div className="bg-canvas px-3 py-5 text-center text-sm text-ink-tertiary">
            Loading daemon connections…
          </div>
        )}
      </div>

      {inventoryNodeId === nodeId && <HarnessInventory harnesses={harnesses} />}

      <ConfirmDialog
        confirmLabel={action.isPending ? "Removing..." : "Remove connection"}
        description={
          <>
            This asks paxd to delete the local connection for{" "}
            <span className="font-medium text-ink">
              {removeTarget?.name ?? removeTarget?.id}
            </span>
            . The cloud agent record is retained.
          </>
        }
        disabled={action.isPending}
        onConfirm={() => {
          if (removeTarget) {
            action.mutate({ connection: removeTarget, type: "remove" });
          }
        }}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(undefined);
        }}
        open={Boolean(removeTarget)}
        title="Remove daemon connection?"
      />
    </section>
  );
}

function HarnessInventory({ harnesses }: { harnesses: NodeDaemonHarness[] }) {
  const available = harnesses.filter(
    (item) => item.state === "available",
  ).length;

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">Harness inventory</h3>
        <span className="text-xs text-ink-tertiary">
          {available}/{harnesses.length} available
        </span>
      </div>
      <div className="grid min-w-0 overflow-hidden rounded-md border border-hairline">
        {harnesses.map((harness) => {
          const detail = harness.last_error || harness.install_hint;
          const provenance = [harness.version, harness.source]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              className="grid min-w-0 gap-2 border-b border-hairline bg-canvas px-3 py-2.5 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_180px]"
              key={harness.harness}
            >
              <div className="flex min-w-0 items-center gap-2">
                <TruncatedText className="font-medium text-ink">
                  {harness.display_name ?? harness.harness}
                </TruncatedText>
                <Badge tone={harnessTone(harness.state)}>{harness.state}</Badge>
              </div>
              <div className="min-w-0">
                <TruncatedText className="font-mono text-xs text-ink-muted">
                  {harness.command?.join(" ") || "No command detected"}
                </TruncatedText>
                {detail && (
                  <TruncatedText
                    className={`mt-1 text-xs ${harness.last_error ? "text-warning" : "text-ink-tertiary"}`}
                  >
                    {detail}
                  </TruncatedText>
                )}
              </div>
              <TruncatedText className="text-xs text-ink-tertiary md:text-right">
                {provenance || harness.harness}
              </TruncatedText>
            </div>
          );
        })}
        {harnesses.length === 0 && (
          <div className="bg-canvas px-3 py-4 text-center text-sm text-ink-tertiary">
            Discover completed without a harness result.
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionRow({
  busy,
  connection,
  onEdit,
  onRemove,
  onRestart,
  onStart,
  onStop,
}: {
  busy: boolean;
  connection: NodeDaemonAgentConnection;
  onEdit: () => void;
  onRemove: () => void;
  onRestart: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const phase = connection.status?.phase ?? connection.desired_state;
  return (
    <article className="grid min-w-0 gap-3 border-b border-hairline bg-canvas px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TruncatedText className="font-medium text-ink">
            {connection.name || connection.id}
          </TruncatedText>
          <Badge
            tone={
              phase === "connected" || phase === "running"
                ? "success"
                : "neutral"
            }
          >
            {phase}
          </Badge>
        </div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {connection.command.join(" ")}
        </TruncatedText>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">
          {connection.harness} · generation {connection.generation} ·{" "}
          {connection.desired_acp_slots} desired slots
        </div>
        <MonoId className="mt-1" tooltip={connection.id}>
          {compactId(connection.id)}
        </MonoId>
      </div>
      <div className="flex items-start justify-end gap-1">
        <Button
          disabled={busy}
          icon={<Pencil className="h-4 w-4" />}
          onClick={onEdit}
          size="icon"
          tooltip="Edit connection"
          type="button"
          variant="ghost"
        />
        {connection.desired_state === "stopped" ? (
          <Button
            disabled={busy}
            icon={<Play className="h-4 w-4" />}
            onClick={onStart}
            size="icon"
            tooltip="Start connection"
            type="button"
            variant="ghost"
          />
        ) : (
          <Button
            disabled={busy}
            icon={<Square className="h-4 w-4" />}
            onClick={onStop}
            size="icon"
            tooltip="Stop connection"
            type="button"
            variant="ghost"
          />
        )}
        <Button
          disabled={busy || connection.desired_state === "stopped"}
          icon={<RotateCw className="h-4 w-4" />}
          onClick={onRestart}
          size="icon"
          tooltip="Restart connection"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={busy}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onRemove}
          size="icon"
          tooltip="Remove daemon connection"
          type="button"
          variant="danger"
        />
      </div>
    </article>
  );
}

function CreateConnectionForm({
  disabled,
  harnesses,
  onCancel,
  onSubmit,
}: {
  disabled: boolean;
  harnesses: { display_name?: string; harness: string; state: string }[];
  onCancel: () => void;
  onSubmit: (input: {
    agent_type: string;
    desired_slots: number;
    harness: string;
    instance_id?: string;
    name: string;
    working_dir?: string;
  }) => void;
}) {
  const firstHarness =
    harnesses.find((item) => item.state === "available")?.harness ?? "";
  const [name, setName] = useState("");
  const [harness, setHarness] = useState(firstHarness);
  const [agentType, setAgentType] = useState(firstHarness);
  const [instanceId, setInstanceId] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [desiredSlots, setDesiredSlots] = useState(2);
  const desiredSlotsValid = validDesiredSlots(desiredSlots);

  return (
    <div className="grid gap-3 rounded-md border border-hairline bg-canvas p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field
          label="Name"
          onChange={setName}
          placeholder="work"
          value={name}
        />
        <SelectHarness
          harnesses={harnesses}
          onChange={(value) => {
            setHarness(value);
            if (!agentType) setAgentType(value);
          }}
          value={harness}
        />
        <Field
          label="Agent type"
          onChange={setAgentType}
          placeholder="codex"
          value={agentType}
        />
        <Field
          label="Instance ID (optional)"
          onChange={setInstanceId}
          placeholder="work"
          value={instanceId}
        />
        <NumberField
          label="Slots"
          max={16}
          min={1}
          onChange={setDesiredSlots}
          value={desiredSlots}
        />
      </div>
      <Field
        label="Working directory (optional)"
        onChange={setWorkingDir}
        placeholder="/workspace/project"
        value={workingDir}
      />
      <div className="flex justify-end gap-2">
        <Button
          icon={<X className="h-4 w-4" />}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={
            disabled ||
            !name.trim() ||
            !harness ||
            !agentType.trim() ||
            !desiredSlotsValid
          }
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onSubmit({
              agent_type: agentType.trim(),
              desired_slots: desiredSlots,
              harness,
              instance_id: instanceId.trim() || undefined,
              name: name.trim(),
              working_dir: workingDir.trim() || undefined,
            })
          }
          type="button"
          variant="primary"
        >
          {disabled ? "Creating..." : "Create agent"}
        </Button>
      </div>
    </div>
  );
}

function EditConnectionForm({
  connection,
  disabled,
  harnesses,
  onCancel,
  onSubmit,
}: {
  connection: NodeDaemonAgentConnection;
  disabled: boolean;
  harnesses: { display_name?: string; harness: string; state: string }[];
  onCancel: () => void;
  onSubmit: (input: {
    desired_slots: number;
    harness: string;
    name: string;
    working_dir?: string;
  }) => void;
}) {
  const [name, setName] = useState(connection.name);
  const [harness, setHarness] = useState(connection.harness);
  const [workingDir, setWorkingDir] = useState(connection.working_dir ?? "");
  const [desiredSlots, setDesiredSlots] = useState(
    connection.desired_acp_slots,
  );
  const desiredSlotsValid = validDesiredSlots(desiredSlots);
  return (
    <div className="grid gap-3 border-b border-hairline bg-canvas p-3 last:border-b-0">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Name"
          onChange={setName}
          placeholder="work"
          value={name}
        />
        <SelectHarness
          harnesses={harnesses}
          onChange={setHarness}
          value={harness}
        />
        <Field
          label="Working directory"
          onChange={setWorkingDir}
          placeholder="/workspace/project"
          value={workingDir}
        />
        <NumberField
          label="Slots"
          max={16}
          min={1}
          onChange={setDesiredSlots}
          value={desiredSlots}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          icon={<X className="h-4 w-4" />}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={disabled || !name.trim() || !harness || !desiredSlotsValid}
          icon={<Save className="h-4 w-4" />}
          onClick={() =>
            onSubmit({
              desired_slots: desiredSlots,
              harness,
              name: name.trim(),
              working_dir: workingDir.trim() || undefined,
            })
          }
          type="button"
          variant="primary"
        >
          {disabled ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
      {label}
      <input
        className="min-h-9 min-w-0 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-hairline-strong"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
      {label}
      <input
        className="min-h-9 min-w-0 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none focus:border-hairline-strong"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        type="number"
        value={value}
      />
    </label>
  );
}

function validDesiredSlots(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 16;
}

function SelectHarness({
  harnesses,
  onChange,
  value,
}: {
  harnesses: { display_name?: string; harness: string; state: string }[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
      Harness
      <select
        className="min-h-9 min-w-0 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none focus:border-hairline-strong"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {harnesses.map((item) => (
          <option
            disabled={item.state !== "available"}
            key={item.harness}
            value={item.harness}
          >
            {item.display_name ?? item.harness} ({item.state})
          </option>
        ))}
      </select>
    </label>
  );
}

function runConnectionAction(
  action: ConnectionAction,
  userId: string,
  nodeId: string,
  connectionId: string,
): Promise<NodeDaemonCommandData> {
  if (action === "stop") {
    return stopNodeDaemonAgentConnection(userId, nodeId, connectionId);
  }
  if (action === "restart") {
    return restartNodeDaemonAgentConnection(userId, nodeId, connectionId);
  }
  if (action === "start") {
    return startNodeDaemonAgentConnection(userId, nodeId, connectionId);
  }
  return removeNodeDaemonAgentConnection(userId, nodeId, connectionId);
}

function commandTone(
  status?: string,
): "danger" | "neutral" | "success" | "warning" {
  if (status === "applied") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  return status === "received" ? "warning" : "neutral";
}

function runtimeTone(
  outcome?: string,
): "danger" | "neutral" | "success" | "warning" {
  if (outcome === "failed") return "danger";
  if (outcome) return "success";
  return "warning";
}

function harnessTone(
  state: string,
): "danger" | "neutral" | "success" | "warning" {
  if (state === "available") return "success";
  if (state === "missing" || state === "error") return "danger";
  return state === "discovering" ? "warning" : "neutral";
}
