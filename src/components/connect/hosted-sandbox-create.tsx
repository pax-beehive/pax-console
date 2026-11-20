"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsLinks } from "@/components/settings/settings-catalog";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/features/api/query-keys";
import {
  readHostedSandbox,
  startHostedSandbox,
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
      return "The sandbox host has reached its limit for saved sandboxes.";
    case "container_exited":
      return "The sandbox stopped before its device connected.";
    case "node_connection_timeout":
      return "The sandbox device did not connect in time.";
    default:
      return "Could not start the sandbox. Try again.";
  }
}

export function useHostedSandboxStatus(
  userId: string,
  {
    readyRefetchInterval = false,
  }: { readyRefetchInterval?: number | false } = {},
) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: queryKeys.hostedSandbox(userId),
    queryFn: ({ signal }) => readHostedSandbox(signal),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.sandbox?.status;
      if (state === "queued" || state === "starting") return 2000;
      return state === "ready" ? readyRefetchInterval : false;
    },
  });
  const sandbox = status.data?.sandbox;
  const nodeId = sandbox?.status === "ready" ? sandbox.node_id : undefined;

  useEffect(() => {
    if (nodeId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
    }
  }, [nodeId, queryClient, userId]);

  return status;
}

export function HostedSandboxCreate({ userId }: { userId: string }) {
  const status = useHostedSandboxStatus(userId);
  return <HostedSandboxControls userId={userId} status={status} />;
}

export function HostedSandboxControls({
  userId,
  status,
  resumeNodeId,
}: {
  userId: string;
  status: ReturnType<typeof useHostedSandboxStatus>;
  resumeNodeId?: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.hostedSandbox(userId);
  const submitting = useRef(false);
  const start = useMutation({
    mutationFn: startHostedSandbox,
    retry: false,
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
      submitting.current = false;
    },
  });

  const sandbox = status.data?.sandbox;
  if (!status.data || (resumeNodeId && sandbox?.node_id !== resumeNodeId)) {
    return null;
  }

  const nodeId = sandbox?.status === "ready" ? sandbox.node_id : undefined;
  const progress = progressMessage(status.data.sandbox, start.isPending);
  const failed = sandbox?.status === "failed" || start.isError;
  const needsRefresh =
    status.isError || (sandbox?.status === "ready" && !nodeId);

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-canvas p-4">
      <h2 className="text-lg font-medium">{t("Pax sandbox")}</h2>
      {needsRefresh ? (
        <>
          <p role="status" className="text-sm text-warning">
            {t("Could not confirm sandbox status.")}
          </p>
          <div>
            <Button
              type="button"
              disabled={status.isFetching}
              onClick={() => void status.refetch()}
            >
              {t("Refresh sandbox status")}
            </Button>
          </div>
        </>
      ) : nodeId ? (
        <>
          <p role="status" className="text-sm text-ink-muted">
            {t("Sandbox connected")}
          </p>
          {!resumeNodeId && (
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
          )}
        </>
      ) : progress ? (
        <p role="status" className="text-sm text-ink-muted">
          {t(progress)}
        </p>
      ) : (
        <>
          {failed && (
            <p role="alert" className="text-sm text-warning">
              {t(failureMessage(sandbox?.reason_code))}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                const current = queryClient.getQueryState(queryKey);
                // A fast response can update the cache before the button rerenders.
                if (
                  submitting.current ||
                  current?.status !== "success" ||
                  current.data !== status.data
                ) {
                  return;
                }
                submitting.current = true;
                start.mutate();
              }}
            >
              {failed && !resumeNodeId
                ? t("Try again")
                : resumeNodeId || sandbox?.status === "sleeping"
                  ? t("Start sandbox")
                  : t("Create sandbox")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
