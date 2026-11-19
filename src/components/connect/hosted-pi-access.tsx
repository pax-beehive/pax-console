"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/features/api/query-keys";
import { activateHostedPi, readHostedStarter } from "@/features/api/resources";
import { useI18n } from "@/features/i18n/use-i18n";

export function useHostedStarter(
  userId: string,
  nodeId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.hostedStarter(userId),
    queryFn: ({ signal }) => readHostedStarter(signal),
    enabled,
    retry: false,
    refetchInterval: ({ state }) =>
      state.data?.enrolled_node && state.data.starter?.node_id === nodeId
        ? 5000
        : false,
  });
}

export function HostedPiAccess({
  userId,
  nodeId,
  agentId,
  status,
}: {
  userId: string;
  nodeId: string;
  agentId: string;
  status: ReturnType<typeof useHostedStarter>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activationLock = useRef(false);
  const queryKey = queryKeys.hostedStarter(userId);
  const activate = useMutation({
    mutationFn: () => activateHostedPi(nodeId, agentId),
    retry: false,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey }).finally(() => {
        activationLock.current = false;
      }),
  });
  const starter = status.data?.starter;
  const quotaExhausted = status.data?.user_budget_available === false;

  if (!status.data?.enrolled_node || starter?.node_id !== nodeId) return null;

  if (status.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-warning">
          {t("Couldn’t check free model access.")}
        </p>
        <Button
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          {t("Check again")}
        </Button>
      </div>
    );
  }
  if (!status.data.enabled || starter.access_paused) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {starter.access_paused
          ? t("Free model access is paused.")
          : t("Free model access is unavailable.")}
      </p>
    );
  }
  if (status.data.pool_available === false) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("The shared free model budget is exhausted.")}
      </p>
    );
  }
  if (quotaExhausted) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Your free model budget is exhausted.")}
      </p>
    );
  }
  const isStarting = starter.state === "queued" || starter.state === "starting";
  if (
    starter.agent_id &&
    starter.agent_id !== agentId &&
    (isStarting || starter.state === "ready")
  ) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Free model access is assigned to another agent in this sandbox.")}
      </p>
    );
  }
  if (activate.isPending || isStarting) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Setting up free model access…")}
      </p>
    );
  }
  if (starter.state === "ready" && starter.agent_id === agentId) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Pax free quota is ready.")}
      </p>
    );
  }

  const failed = activate.isError || starter.state === "failed";
  return (
    <div className="space-y-2">
      {failed && (
        <p role="alert" className="text-sm text-warning">
          {t("Couldn’t enable free model access.")}
        </p>
      )}
      <Button
        disabled={
          status.isFetching ||
          (starter.state !== "sleeping" && starter.state !== "failed")
        }
        onClick={() => {
          if (activationLock.current) return;
          const latest = queryClient.getQueryData<typeof status.data>(queryKey);
          if (latest !== status.data) return;
          activationLock.current = true;
          activate.mutate();
        }}
      >
        {t(failed ? "Retry free model setup" : "Use Pax free quota")}
      </Button>
    </div>
  );
}
