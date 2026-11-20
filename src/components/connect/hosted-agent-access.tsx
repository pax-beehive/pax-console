"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/features/api/query-keys";
import {
  activateHostedAgent,
  readHostedStarter,
} from "@/features/api/resources";
import type {
  HostedStarterStatus,
  SandboxModelAccess,
  SandboxModelAccessAgent,
} from "@/features/api/types";
import { useI18n } from "@/features/i18n/use-i18n";

const leaseStates = new Set<SandboxModelAccessAgent["state"]>([
  "queued",
  "starting",
  "ready",
  "failed",
]);

function setupErrorMessage(reason?: string) {
  switch (reason) {
    case "lease_expired":
      return "Free model access expired. Set it up again.";
    case "lease_ended":
      return "Free model access ended. Set it up again.";
    case "host_capacity":
      return "The sandbox host is full. Try again later.";
    case "host_environment_limit":
      return "The sandbox host has reached its limit for saved sandboxes.";
    case "container_exited":
      return "The sandbox stopped before its device connected.";
    case "node_connection_timeout":
      return "The sandbox device did not connect in time.";
    default:
      return "Couldn’t enable free model access.";
  }
}

type HostedAgentEligibility = {
  state: SandboxModelAccess["state"];
  agentId?: string;
  accessPaused: boolean;
  agents?: Map<string, SandboxModelAccessAgent>;
};

export function hostedAgentAccess(
  status: HostedStarterStatus | undefined,
  nodeId: string,
  harness: string,
): HostedAgentEligibility | undefined {
  const sandbox = status?.sandbox_model_access;
  const starter = status?.starter;
  if (sandbox?.node_id === nodeId) {
    if (
      !Array.isArray(sandbox.harnesses) ||
      sandbox.harnesses.some((name) => typeof name !== "string") ||
      !sandbox.harnesses.includes(harness) ||
      (sandbox.state !== "available" && !leaseStates.has(sandbox.state)) ||
      (sandbox.agent_id !== undefined &&
        (typeof sandbox.agent_id !== "string" || !sandbox.agent_id)) ||
      ((sandbox.state === "queued" ||
        sandbox.state === "starting" ||
        sandbox.state === "ready") &&
        !sandbox.agent_id)
    ) {
      return undefined;
    }
    let agents: HostedAgentEligibility["agents"];
    if (sandbox.agents !== undefined) {
      if (
        !Array.isArray(sandbox.agents) ||
        sandbox.state !== "available" ||
        sandbox.agent_id !== undefined
      ) {
        return undefined;
      }
      agents = new Map();
      for (const agent of sandbox.agents) {
        if (
          typeof agent?.agent_id !== "string" ||
          !agent.agent_id ||
          !leaseStates.has(agent.state) ||
          agents.has(agent.agent_id)
        ) {
          return undefined;
        }
        agents.set(agent.agent_id, agent);
      }
    }
    return {
      state: sandbox.state,
      agentId: sandbox.agent_id,
      accessPaused: starter?.access_paused === true,
      agents,
    };
  }
  if (
    harness !== "pi" ||
    status?.enrolled_node !== true ||
    starter?.node_id !== nodeId
  ) {
    return undefined;
  }
  return {
    state: starter.state === "sleeping" ? "available" : starter.state,
    agentId: starter.agent_id,
    accessPaused: starter.access_paused === true,
  };
}

export function useHostedStarter(
  userId: string,
  nodeId: string,
  harness?: string,
) {
  return useQuery({
    queryKey: queryKeys.hostedStarter(userId),
    queryFn: ({ signal }) => readHostedStarter(signal),
    enabled: Boolean(harness),
    retry: false,
    refetchInterval: ({ state }) =>
      harness && hostedAgentAccess(state.data, nodeId, harness) ? 5000 : false,
  });
}

export function HostedAgentAccess({
  userId,
  nodeId,
  agentId,
  harness,
  status,
  showReady = true,
}: {
  userId: string;
  nodeId: string;
  agentId: string;
  harness: string;
  status: ReturnType<typeof useHostedStarter>;
  showReady?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activationLock = useRef(false);
  const queryKey = queryKeys.hostedStarter(userId);
  const activate = useMutation({
    mutationFn: () => activateHostedAgent(nodeId, agentId),
    retry: false,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey }).finally(() => {
        activationLock.current = false;
      }),
  });
  const access = hostedAgentAccess(status.data, nodeId, harness);
  if (!status.data || !access) return null;

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
  if (status.data.enabled !== true || access.accessPaused) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {access.accessPaused
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
  if (status.data.user_budget_available === false) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Your free model budget is exhausted.")}
      </p>
    );
  }
  const agent = access.agents?.get(agentId);
  const state = agent?.state ?? access.state;
  const assignedAgent = access.agents ? agentId : access.agentId;
  const isStarting = state === "queued" || state === "starting";
  if (
    assignedAgent &&
    assignedAgent !== agentId &&
    (isStarting || state === "ready")
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
  if (state === "ready" && assignedAgent === agentId) {
    return showReady ? (
      <p role="status" className="text-sm text-ink-muted">
        {t("Pax free quota is ready.")}
      </p>
    ) : null;
  }

  const failed = activate.isError || state === "failed";
  return (
    <div className="space-y-2">
      {failed && (
        <p role="alert" className="text-sm text-warning">
          {t(
            setupErrorMessage(
              state === "failed" ? agent?.reason_code : undefined,
            ),
          )}
        </p>
      )}
      <Button
        disabled={
          status.isFetching || (state !== "available" && state !== "failed")
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
