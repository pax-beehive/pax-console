"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsLinks } from "@/components/settings/settings-catalog";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/features/api/query-keys";
import {
  readHostedSandbox,
  restartHostedSandbox,
  resumeHostedSandbox,
  startHostedSandbox,
  useNodes,
} from "@/features/api/resources";
import { useI18n } from "@/features/i18n/use-i18n";
import type { HostedSandboxStatus } from "@/features/api/types";

function progressMessage(
  sandbox: HostedSandboxStatus["sandbox"],
  requesting: boolean,
) {
  switch (sandbox?.status) {
    case "queued":
      return sandbox.reason_code === "waiting_for_capacity"
        ? "The sandbox host is full. Waiting for an available slot…"
        : "Sandbox queued. Waiting for a host…";
    case "starting":
      return "Starting sandbox…";
    default:
      return requesting ? "Requesting sandbox…" : null;
  }
}

function failureMessage(reason?: string) {
  switch (reason) {
    case "host_environment_limit":
      return [
        "Sandbox host capacity",
        "The sandbox host has reached its limit for saved sandboxes.",
      ];
    case "container_exited":
      return [
        "Sandbox container startup",
        "The sandbox stopped before its device connected.",
      ];
    case "node_connection_timeout":
      return [
        "Sandbox device connection",
        "The sandbox device did not connect in time.",
      ];
    default:
      return ["Sandbox startup", "Could not start the sandbox. Try again."];
  }
}

export function useHostedSandboxStatus(
  userId: string,
  {
    enabled = true,
    readyRefetchInterval = false,
  }: { enabled?: boolean; readyRefetchInterval?: number | false } = {},
) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: queryKeys.hostedSandbox(userId),
    queryFn: ({ signal }) => readHostedSandbox(signal),
    enabled,
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.sandbox?.status;
      if (state === "queued" || state === "starting") return 2000;
      return state === "ready" ? readyRefetchInterval : false;
    },
  });
  const ready = status.data?.sandbox?.status === "ready";
  const nodeId = status.data?.sandbox?.node_id;
  const generation = status.data?.sandbox?.generation;
  useEffect(() => {
    if (enabled && ready && nodeId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hostedStarter(userId),
      });
    }
  }, [enabled, ready, nodeId, generation, queryClient, userId]);
  return status;
}

export function HostedSandboxCreate({
  userId,
  dedicated = false,
}: {
  userId: string;
  dedicated?: boolean;
}) {
  const status = useHostedSandboxStatus(userId, {
    readyRefetchInterval: 15_000,
  });
  const nodes = useNodes(userId);
  const node = nodes.data?.nodes.find(
    (node) => node.node_id === status.data?.sandbox?.node_id,
  );
  return (
    <HostedSandboxControls
      userId={userId}
      status={status}
      nodeOnline={nodes.error ? undefined : node?.online}
      dedicated={dedicated}
    />
  );
}

type SandboxAction =
  | { type: "create" }
  | { type: "resume"; nodeId: string }
  | { type: "restart"; nodeId: string; generation: number };

export function HostedSandboxControls({
  userId,
  status,
  targetNodeId,
  nodeOnline,
  dedicated = false,
}: {
  userId: string;
  status: ReturnType<typeof useHostedSandboxStatus>;
  targetNodeId?: string;
  nodeOnline?: boolean;
  dedicated?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.hostedSandbox(userId);
  const submitting = useRef(false);
  const sandbox = status.data?.sandbox;
  const nodeId = sandbox?.node_id;
  const ready = sandbox?.status === "ready";
  const generation = sandbox?.generation;
  const start = useMutation({
    mutationFn: (action: SandboxAction) => {
      switch (action.type) {
        case "resume":
          return resumeHostedSandbox(action.nodeId);
        case "restart":
          return restartHostedSandbox(action.nodeId, action.generation);
        case "create":
          return startHostedSandbox();
      }
    },
    retry: false,
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
      submitting.current = false;
    },
  });

  if (targetNodeId && nodeId !== targetNodeId) return null;
  if (status.data === null) {
    return dedicated ? (
      <p className="text-sm text-ink-muted">{t("Sandbox is unavailable.")}</p>
    ) : null;
  }
  if (!status.data && !dedicated) return null;
  if (targetNodeId && ready && nodeOnline === true && !status.isError)
    return null;
  if (!status.data && status.isPending) {
    return <p role="status">{t("Checking sandbox status…")}</p>;
  }

  const progress = progressMessage(sandbox ?? null, start.isPending);
  const needsRefresh = status.isError || (ready && !nodeId);
  const failed = sandbox?.status === "failed";
  const failure = start.isError
    ? [
        "Sandbox start request",
        "Could not confirm the sandbox start request. Check its status or try again.",
      ]
    : failed
      ? failureMessage(sandbox.reason_code)
      : undefined;
  let action: SandboxAction | undefined;
  if (nodeId && (sandbox?.status === "sleeping" || failed)) {
    action = { type: "resume", nodeId };
  } else if (!targetNodeId && status.data && !nodeId && (!sandbox || failed)) {
    action = { type: "create" };
  } else if (
    nodeId &&
    ready &&
    nodeOnline === false &&
    typeof generation === "number" &&
    Number.isSafeInteger(generation) &&
    generation > 0
  ) {
    action = { type: "restart", nodeId, generation };
  }
  const refresh = () => {
    void status.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
  };
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-canvas p-4">
      {!dedicated && (
        <h2 className="text-lg font-medium">{t("Pax sandbox")}</h2>
      )}
      {needsRefresh ? (
        <>
          <p role="alert" className="text-sm text-warning">
            <span className="block font-medium">
              {t("Sandbox status check")}
            </span>
            {t("Could not confirm sandbox status.")}
          </p>
          <div>
            <Button
              type="button"
              disabled={status.isFetching}
              onClick={refresh}
            >
              {t("Refresh sandbox status")}
            </Button>
          </div>
        </>
      ) : progress ? (
        <p role="status" className="text-sm text-ink-muted">
          {t(progress)}
        </p>
      ) : ready && nodeId && nodeOnline === true ? (
        <>
          <p role="status" className="text-sm text-ink-muted">
            {t("Sandbox connected")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/nodes/${encodeURIComponent(nodeId)}`}>
                {t("Open device")}
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link
                href={`${settingsLinks.addAgent}?nodeId=${encodeURIComponent(nodeId)}`}
              >
                {t("Add agent")}
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          {ready && (
            <p role="status" className="text-sm text-ink-muted">
              {nodeOnline === false
                ? t("The sandbox device is offline.")
                : t("Waiting for the sandbox device to reconnect…")}
            </p>
          )}
          {failure && (
            <p role="alert" className="text-sm text-warning">
              <span className="block font-medium">{t(failure[0])}</span>
              {t(failure[1])}
            </p>
          )}
          <div>
            {action ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const latest = queryClient.getQueryState(queryKey);
                  if (
                    submitting.current ||
                    latest?.status !== "success" ||
                    latest.data !== status.data
                  )
                    return;
                  submitting.current = true;
                  start.mutate(action);
                }}
              >
                {action.type === "restart"
                  ? t("Restart sandbox")
                  : action.type === "resume"
                    ? t("Start sandbox")
                    : failure
                      ? t("Try again")
                      : t("Create sandbox")}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={refresh}
                disabled={status.isFetching}
              >
                {t("Refresh sandbox status")}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
