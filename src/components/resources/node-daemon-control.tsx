"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
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
  removeNodeDaemonAgentConnection,
  restartNodeDaemonAgentConnection,
  stopNodeDaemonAgentConnection,
  updateNodeDaemonAgentConnection,
  useNodeDaemonAgentConnections,
  useNodeDaemonCommand,
  useNodeDaemonHarnesses,
  useNodeDaemonStatus,
} from "@/features/api/resources";
import {
  NodeDaemonAgentConnection,
  NodeDaemonCommandData,
} from "@/features/api/types";
import { compactId } from "@/lib/format";

type NodeDaemonControlProps = {
  nodeId: string;
  userId: string;
};

type ConnectionAction = "remove" | "restart" | "stop";

export function NodeDaemonControl({ nodeId, userId }: NodeDaemonControlProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<NodeDaemonAgentConnection>();
  const [removeTarget, setRemoveTarget] = useState<NodeDaemonAgentConnection>();
  const [lastCommandId, setLastCommandId] = useState<string>();

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
  );
  const commandQuery = useNodeDaemonCommand(userId, nodeId, lastCommandId);
  const commandStatus = commandQuery.data?.command?.status;
  const commandRunning = Boolean(
    lastCommandId &&
    !commandQuery.error &&
    !commandQuery.data?.error &&
    (!commandStatus ||
      !["applied", "failed", "rejected"].includes(commandStatus)),
  );

  useEffect(() => {
    if (
      !commandStatus ||
      !["applied", "failed", "rejected"].includes(commandStatus)
    ) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: queryKeys.nodeDaemonAgentConnections(userId, nodeId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.agents(userId, nodeId),
    });
  }, [commandStatus, nodeId, queryClient, userId]);

  const create = useMutation({
    mutationFn: (input: {
      agent_type: string;
      harness: string;
      instance_id?: string;
      name: string;
      working_dir?: string;
    }) => createNodeDaemonAgentConnection(userId, nodeId, input),
    onSuccess: (data) => {
      setCreateOpen(false);
      setLastCommandId(data.command_id);
    },
  });
  const update = useMutation({
    mutationFn: (input: {
      connectionId: string;
      harness: string;
      name: string;
      working_dir?: string;
    }) =>
      updateNodeDaemonAgentConnection(userId, nodeId, input.connectionId, {
        harness: input.harness,
        name: input.name,
        working_dir: input.working_dir,
      }),
    onSuccess: (data) => {
      setEditing(undefined);
      setLastCommandId(data.command_id);
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
    onSuccess: (data) => {
      setRemoveTarget(undefined);
      setLastCommandId(data.command_id);
    },
  });

  const harnesses = harnessesQuery.data?.harnesses?.items ?? [];
  const connections = connectionsQuery.data?.agent_connections?.items ?? [];
  const phase = statusQuery.data?.status?.phase;
  const queryError =
    statusQuery.error ?? harnessesQuery.error ?? connectionsQuery.error;
  const controlError =
    statusQuery.data?.error ??
    harnessesQuery.data?.error ??
    connectionsQuery.data?.error ??
    commandQuery.data?.error;
  const mutationError = create.error ?? update.error ?? action.error;

  const refresh = async () => {
    await statusQuery.refetch();
    await harnessesQuery.refetch();
    await connectionsQuery.refetch();
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
            disabled={statusQuery.isFetching || commandRunning}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void refresh()}
            size="icon"
            tooltip="Refresh paxd control state"
            type="button"
            variant="ghost"
          />
          <Button
            disabled={!harnesses.length || commandRunning}
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
          disabled={create.isPending}
          harnesses={harnesses}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      )}

      {lastCommandId && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2">
          <span className="text-xs text-ink-tertiary">Last command</span>
          <MonoId tooltip={lastCommandId}>{compactId(lastCommandId)}</MonoId>
          <Badge tone={commandTone(commandStatus)}>
            {commandStatus ?? "polling"}
          </Badge>
          {commandQuery.data?.command?.error_message && (
            <TruncatedText className="text-xs text-warning">
              {commandQuery.data.command.error_message}
            </TruncatedText>
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
              busy={action.isPending || commandRunning}
              connection={connection}
              key={connection.id}
              onEdit={() => setEditing(connection)}
              onRemove={() => setRemoveTarget(connection)}
              onRestart={() => action.mutate({ connection, type: "restart" })}
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

function ConnectionRow({
  busy,
  connection,
  onEdit,
  onRemove,
  onRestart,
  onStop,
}: {
  busy: boolean;
  connection: NodeDaemonAgentConnection;
  onEdit: () => void;
  onRemove: () => void;
  onRestart: () => void;
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
          <Badge tone={phase === "connected" ? "success" : "neutral"}>
            {phase}
          </Badge>
        </div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {connection.command.join(" ")}
        </TruncatedText>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">
          {connection.harness} · generation {connection.generation}
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
        <Button
          disabled={busy || connection.desired_state === "stopped"}
          icon={<Square className="h-4 w-4" />}
          onClick={onStop}
          size="icon"
          tooltip="Stop connection"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={busy}
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

  return (
    <div className="grid gap-3 rounded-md border border-hairline bg-canvas p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          disabled={disabled || !name.trim() || !harness || !agentType.trim()}
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onSubmit({
              agent_type: agentType.trim(),
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
    harness: string;
    name: string;
    working_dir?: string;
  }) => void;
}) {
  const [name, setName] = useState(connection.name);
  const [harness, setHarness] = useState(connection.harness);
  const [workingDir, setWorkingDir] = useState(connection.working_dir ?? "");
  return (
    <div className="grid gap-3 border-b border-hairline bg-canvas p-3 last:border-b-0">
      <div className="grid gap-3 md:grid-cols-3">
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
          disabled={disabled || !name.trim() || !harness}
          icon={<Save className="h-4 w-4" />}
          onClick={() =>
            onSubmit({
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
  return removeNodeDaemonAgentConnection(userId, nodeId, connectionId);
}

function commandTone(
  status?: string,
): "danger" | "neutral" | "success" | "warning" {
  if (status === "applied") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  return status === "received" ? "warning" : "neutral";
}
