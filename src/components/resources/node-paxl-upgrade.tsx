"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getLatestPaxlRelease,
  getNodeDaemonCommand,
  upgradeNodePaxl,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { Node, PaxlObservation } from "@/features/api/types";

const changed = "paxl-upgrade-command";
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
function parse(
  raw: string | null,
): { command_id: string; version: string } | undefined {
  try {
    const value = JSON.parse(raw ?? "null");
    return typeof value?.command_id === "string" &&
      typeof value?.version === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function observation(value: unknown): PaxlObservation | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    typeof value.status !== "string"
  )
    return undefined;
  return value as PaxlObservation;
}

export function NodePaxlUpgrade({
  node,
  userId,
}: {
  node: Node;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState("");
  const client = useQueryClient();
  const key = `paxl-upgrade:${userId}:${node.node_id}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const pending = parse(raw);
  const command = useQuery({
    queryKey: queryKeys.nodeDaemonCommand(
      userId,
      node.node_id,
      pending?.command_id ?? "pending",
    ),
    queryFn: () =>
      getNodeDaemonCommand(userId, node.node_id, pending!.command_id),
    enabled: Boolean(pending && node.online),
    retry: false,
    refetchInterval: (q) =>
      ["applied", "failed", "rejected"].includes(
        q.state.data?.command?.status ?? "",
      )
        ? false
        : 2000,
  });
  const status = command.data?.command?.status;
  const terminal = status && ["applied", "failed", "rejected"].includes(status);
  const reported = observation(node.metadata?.paxl);
  const verified =
    status === "applied" ? command.data?.command?.result?.paxl : undefined;
  const installed =
    verified &&
    (!reported?.checked_at ||
      Date.parse(verified.checked_at ?? "") > Date.parse(reported.checked_at))
      ? verified
      : reported;
  const latest = useQuery({
    queryKey: ["paxl-release", node.os, node.arch, "stable"],
    queryFn: () => getLatestPaxlRelease(node.os!, node.arch!),
    enabled: open && Boolean(node.os && node.arch),
  });
  const mutation = useMutation({
    mutationFn: (request: { command_id: string; version: string }) =>
      upgradeNodePaxl(userId, node.node_id, request),
    onSuccess: () => {
      setOpen(false);
      void command.refetch();
      void client.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
    },
  });
  function submit() {
    if (!latest.data?.version) return;
    const request = {
      command_id: crypto.randomUUID(),
      version: latest.data.version,
    };
    try {
      localStorage.setItem(key, JSON.stringify(request));
      window.dispatchEvent(new Event(changed));
    } catch {
      setStorageError(
        "Could not save the command for recovery. Enable browser storage and retry.",
      );
      return;
    }
    mutation.mutate(request);
  }
  const error =
    mutation.error?.message ??
    command.data?.command?.error_message ??
    storageError;
  return (
    <div className="grid min-w-0 gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          title={[installed?.path, installed?.checked_at, installed?.error]
            .filter(Boolean)
            .join(" · ")}
        >
          paxl {installed?.version ?? installed?.status ?? "not reported"}
          {!node.online && installed ? " · last observed" : ""}
        </span>
        <Button
          size="sm"
          disabled={
            !node.online ||
            installed?.status !== "installed" ||
            Boolean(pending && !terminal)
          }
          onClick={() => setOpen(true)}
        >
          Upgrade paxl
        </Button>
      </div>
      {pending && (
        <div role="status">
          {status === "applied"
            ? `paxl ${command.data?.command?.result?.paxl?.version ?? pending.version} verified`
            : `${status ?? "Result pending"} · ${command.data?.command?.result?.phase ?? pending.version}`}
          {!terminal && !mutation.isPending && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!node.online}
              onClick={() => mutation.mutate(pending)}
            >
              Retry same command
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-warning">
          {error}
        </p>
      )}
      {command.error && (
        <p className="text-ink-muted">
          Connection unavailable. The saved command will be checked again.
        </p>
      )}
      <ConfirmDialog
        title="Upgrade paxl?"
        open={open}
        onOpenChange={setOpen}
        confirmLabel="Install paxl update"
        onConfirm={submit}
        disabled={mutation.isPending}
        confirmDisabled={
          !latest.data?.version ||
          latest.data.version.replace(/^v/, "") ===
            installed?.version?.replace(/^v/, "")
        }
        description={
          <div>
            <p>
              {installed?.version ?? "Unknown"} →{" "}
              {latest.data?.version ?? "Checking stable release…"}
            </p>
            <p>
              New paxl invocations will use this version. Running processes
              continue; paxd stays connected.
            </p>
            {latest.error && <p role="alert">{latest.error.message}</p>}
          </div>
        }
      />
    </div>
  );
}
