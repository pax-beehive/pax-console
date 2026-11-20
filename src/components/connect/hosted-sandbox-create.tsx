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

export function HostedSandboxCreate({ userId }: { userId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.hostedSandbox(userId);
  const submitting = useRef(false);
  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => readHostedSandbox(signal),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.sandbox?.status;
      return state === "queued" || state === "starting" ? 2000 : false;
    },
  });
  const sandbox = status.data?.sandbox;
  const nodeId = sandbox?.status === "ready" ? sandbox.node_id : undefined;
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

  useEffect(() => {
    if (nodeId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
    }
  }, [nodeId, queryClient, userId]);

  if (!status.data) return null;

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
                if (submitting.current) return;
                submitting.current = true;
                start.mutate();
              }}
            >
              {failed
                ? t("Try again")
                : sandbox?.status === "sleeping"
                  ? t("Start sandbox")
                  : t("Create sandbox")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
