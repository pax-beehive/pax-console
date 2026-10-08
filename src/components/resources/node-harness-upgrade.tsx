"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getNodeDaemonCommand,
  upgradeNodeHarness,
  useNodeDaemonAgentConnections,
  type HarnessUpgradeInput,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import type { Node } from "@/features/api/types";

const changed = "harness-upgrade-command";
const phases: Record<string, string> = {
  inspecting: "Checking installation",
  waiting_idle: "Waiting for active tasks to finish",
  installing: "Installing selected version",
  restarting: "Restarting affected adapters",
  verifying_runtime: "Verifying new adapter processes",
  verifying: "Verifying installation",
  rolling_back: "Restoring previous installation",
};
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", listener);
  };
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
type SavedUpgrade = HarnessUpgradeInput & { rejection?: string };
function parse(raw: string | null): SavedUpgrade | undefined {
  try {
    const v = JSON.parse(raw ?? "null");
    if (
      typeof v?.command_id === "string" &&
      typeof v.version === "string" &&
      ["claude-code", "codex", "pi"].includes(v.harness) &&
      ((v.component === "cli" && !v.connection_id) ||
        (v.component === "acp" &&
          typeof v.connection_id === "string" &&
          v.connection_id.length > 0))
    )
      return v;
  } catch {
    /* Storage may contain an incomplete older request. */
  }
}

export function NodeHarnessUpgrade({
  node,
  userId,
}: {
  node: Node;
  userId: string;
}) {
  const [harness, setHarness] =
    useState<HarnessUpgradeInput["harness"]>("claude-code");
  const [component, setComponent] =
    useState<HarnessUpgradeInput["component"]>("acp");
  const [version, setVersion] = useState("");
  const [connection, setConnection] = useState("");
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState("");
  const client = useQueryClient();
  const key = `harness-upgrade-v2:${userId}:${node.node_id}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const pending = parse(raw);
  const connections = useNodeDaemonAgentConnections(
    userId,
    node.node_id,
    Boolean(node.online),
  );
  const eligible = (connections.data?.agent_connections?.items ?? []).filter(
    (c) => c.harness === harness && c.enabled && c.desired_state === "running",
  );
  const command = useQuery({
    queryKey: queryKeys.nodeDaemonCommand(
      userId,
      node.node_id,
      pending?.command_id ?? "pending-harness",
    ),
    queryFn: () =>
      getNodeDaemonCommand(userId, node.node_id, pending!.command_id),
    enabled: Boolean(pending && !pending.rejection && node.online),
    retry: false,
    refetchInterval: (q) =>
      ["applied", "failed", "rejected"].includes(
        q.state.data?.command?.status ?? "",
      )
        ? false
        : 2000,
  });
  const status = pending?.rejection
    ? "rejected"
    : command.data?.command?.status;
  const terminal = Boolean(
    status && ["applied", "failed", "rejected"].includes(status),
  );
  const mutation = useMutation({
    mutationFn: (request: HarnessUpgradeInput) =>
      upgradeNodeHarness(userId, node.node_id, request),
    onSuccess: (response, request) => {
      setOpen(false);
      if (["failed", "rejected"].includes(response.command_status ?? "")) {
        const ackError = response.command_ack?.error as
          | { message?: string }
          | undefined;
        const rejection =
          ackError?.message ??
          "The daemon rejected this upgrade. Check its version and installation support.";
        try {
          localStorage.setItem(key, JSON.stringify({ ...request, rejection }));
          window.dispatchEvent(new Event(changed));
        } catch {
          setStorageError(rejection);
        }
      } else {
        void command.refetch();
      }
      void client.invalidateQueries({
        queryKey: queryKeys.nodeDaemonAgentConnections(userId, node.node_id),
      });
    },
  });
  const valid =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$/.test(
      version.trim(),
    ) &&
    (component === "cli" || eligible.some((c) => c.id === connection));
  const disabled =
    !node.online || mutation.isPending || Boolean(pending && !terminal);
  function submit() {
    if (!valid || disabled) return;
    const request: HarnessUpgradeInput = {
      command_id: crypto.randomUUID(),
      harness,
      component,
      version: version.trim(),
      ...(component === "acp" ? { connection_id: connection } : {}),
    };
    try {
      localStorage.setItem(key, JSON.stringify(request));
      window.dispatchEvent(new Event(changed));
    } catch {
      setStorageError(
        "Could not save the upgrade for recovery. Enable browser storage and retry.",
      );
      return;
    }
    mutation.mutate(request);
  }
  const error =
    storageError ||
    pending?.rejection ||
    mutation.error?.message ||
    command.data?.command?.error_message;
  const phase = command.data?.command?.result?.phase;
  return (
    <section className="grid gap-3 text-sm" aria-label="Harness upgrades">
      <h2 className="font-medium">Harness and ACP updates</h2>
      <p className="text-ink-muted">
        Choose an exact version. Active tasks finish before the update; new
        tasks wait. Supports npm installations with a direct launcher.
      </p>
      {harness === "pi" && component === "cli" && (
        <p className="text-ink-muted">
          Requires Pi ACP 0.7.0 or newer. Connected Pi agents restart with the
          updated Pi SDK. Connections configured with a separate SDK stay on
          that installation.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          Harness
          <select
            className="rounded border border-hairline bg-surface-2 p-2"
            aria-label="Harness"
            value={harness}
            disabled={disabled}
            onChange={(e) => {
              setHarness(e.target.value as HarnessUpgradeInput["harness"]);
              setConnection("");
            }}
          >
            <option value="claude-code">Claude</option>
            <option value="codex">Codex</option>
            <option value="pi">Pi</option>
          </select>
        </label>
        <label className="grid gap-1">
          Component
          <select
            aria-label="Component"
            className="rounded border border-hairline bg-surface-2 p-2"
            value={component}
            disabled={disabled}
            onChange={(e) =>
              setComponent(e.target.value as HarnessUpgradeInput["component"])
            }
          >
            <option value="cli">Harness CLI</option>
            <option value="acp">ACP adapter</option>
          </select>
        </label>
        {component === "acp" && (
          <label className="grid gap-1">
            ACP connection
            <select
              className="rounded border border-hairline bg-surface-2 p-2"
              aria-label="ACP connection"
              value={connection}
              disabled={disabled}
              onChange={(e) => setConnection(e.target.value)}
            >
              <option value="">Select a running connection</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          Target version
          <input
            className="rounded border border-hairline bg-surface-2 p-2"
            value={version}
            disabled={disabled}
            placeholder="1.2.3"
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
      </div>
      {connections.error && <p role="alert">{connections.error.message}</p>}
      <Button
        size="sm"
        disabled={disabled || !valid}
        onClick={() => setOpen(true)}
      >
        Upgrade selected component
      </Button>
      {pending && (
        <div role="status">
          {status === "applied"
            ? `${pending.harness === "claude-code" ? "Claude" : pending.harness === "pi" ? "Pi" : "Codex"} ${pending.component === "cli" ? "CLI" : "ACP adapter"} ${pending.version} verified`
            : `${phases[phase ?? ""] ?? status ?? "Result pending"} · ${pending.version}`}
          {!terminal && !mutation.isPending && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!node.online}
              onClick={() => mutation.mutate(pending)}
            >
              Retry same upgrade
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Upgrade selected component"
        description={`Install ${harness === "claude-code" ? "Claude" : harness === "pi" ? "Pi" : "Codex"} ${component === "cli" ? "CLI" : "ACP adapter"} ${version.trim()}? Existing installation files are retained for recovery. Affected ACP processes restart and are verified before completion.`}
        confirmLabel="Install update"
        confirmDisabled={!valid || disabled}
        onConfirm={submit}
      />
    </section>
  );
}
