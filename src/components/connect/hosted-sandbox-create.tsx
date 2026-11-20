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

  const pending =
    start.isPending ||
    sandbox?.status === "queued" ||
    sandbox?.status === "starting";
  const needsRefresh = status.isError || sandbox?.status === "ready";

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-canvas p-4">
      <h2 className="text-lg font-medium">{t("Pax sandbox")}</h2>
      {nodeId ? (
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
      ) : pending && !status.isError ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("Starting sandbox…")}
        </p>
      ) : needsRefresh ? (
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
      ) : (
        <>
          {(start.isError || sandbox?.status === "failed") && (
            <p role="alert" className="text-sm text-warning">
              {t("Could not start the sandbox. Try again.")}
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
              {sandbox?.status === "sleeping"
                ? t("Start sandbox")
                : sandbox?.status === "failed" || start.isError
                  ? t("Try again")
                  : t("Create sandbox")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
