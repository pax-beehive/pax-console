"use client";

import { type ReactNode, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/features/api/query-keys";
import {
  activateHostedAgent,
  readHostedStarter,
  revokeHostedAgent,
} from "@/features/api/resources";
import type {
  HostedStarterStatus,
  SandboxModelAccess,
  SandboxModelAccessAgent,
} from "@/features/api/types";
import { useI18n } from "@/features/i18n/use-i18n";

const leaseStates = new Set<SandboxModelAccessAgent["state"]>([
  "available",
  "queued",
  "starting",
  "ready",
  "failed",
]);

function setupErrorMessage(reason?: string) {
  switch (reason) {
    case "acp_probe_timeout":
      return [
        "Agent model session startup",
        "The agent took too long to start a free model session.",
      ];
    case "acp_session_failed":
      return [
        "Agent model session startup",
        "The agent could not start a free model session.",
      ];
    case "lease_expired":
      return [
        "Free model authorization",
        "Free model access expired. Set it up again.",
      ];
    case "lease_ended":
      return [
        "Free model authorization",
        "Free model access ended. Set it up again.",
      ];
    case "host_capacity":
      return [
        "Sandbox host capacity",
        "The sandbox host is full. Try again later.",
      ];
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
      return ["Free model setup", "Couldn’t enable free model access."];
  }
}

type HostedAgentEligibility = {
  state: SandboxModelAccess["state"];
  agentId?: string;
  accessPaused: boolean;
  canActivate: boolean;
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
      !leaseStates.has(sandbox.state) ||
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
          (agent.enabled !== undefined && typeof agent.enabled !== "boolean") ||
          agents.has(agent.agent_id)
        ) {
          return undefined;
        }
        agents.set(agent.agent_id, agent);
      }
    }
    const canActivate = sandbox.harnesses.includes(harness);
    if (!canActivate && !agents?.size) return undefined;
    return {
      state: sandbox.state,
      agentId: sandbox.agent_id,
      accessPaused: starter?.access_paused === true,
      canActivate,
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
    canActivate: true,
  };
}

export function useHostedStarter(
  userId: string,
  nodeId: string,
  harness?: string,
  {
    checkBeforeLaunch = false,
    keepPolling = false,
  }: { checkBeforeLaunch?: boolean; keepPolling?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.hostedStarter(userId),
    queryFn: ({ signal }) => readHostedStarter(signal),
    enabled: Boolean(harness) || checkBeforeLaunch,
    refetchOnMount: checkBeforeLaunch ? "always" : true,
    retry: false,
    refetchInterval: ({ state }) =>
      keepPolling || (harness && hostedAgentAccess(state.data, nodeId, harness))
        ? 5000
        : false,
  });
}

export function HostedAgentAccess({
  userId,
  nodeId,
  agentId,
  harness,
  status,
  showAuthorization = true,
  sandboxReady = true,
  waitingForConfirmedGrant = false,
}: {
  userId: string;
  nodeId: string;
  agentId: string;
  harness: string;
  status: ReturnType<typeof useHostedStarter>;
  showAuthorization?: boolean;
  sandboxReady?: boolean;
  waitingForConfirmedGrant?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const queryKey = queryKeys.hostedStarter(userId);
  const changeAccess = useMutation({
    mutationKey: queryKeys.hostedAgentChange(userId, nodeId, agentId),
    mutationFn: (action: "enable" | "revoke") =>
      action === "enable"
        ? activateHostedAgent(nodeId, agentId)
        : revokeHostedAgent(nodeId, agentId),
    retry: false,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey }).finally(() => {
        submitting.current = false;
      }),
  });
  const access = hostedAgentAccess(status.data, nodeId, harness);
  const agent = access?.agents?.get(agentId);
  const authorized = agent?.enabled === true;
  const showAuthorizedControls = showAuthorization && authorized;
  const missingGrant =
    waitingForConfirmedGrant && !agent && access?.agentId !== agentId;
  if (
    !missingGrant &&
    (!status.data || !access || (!access.canActivate && !authorized))
  )
    return null;

  if (status.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-warning">
          <span className="block font-medium">
            {t("Free model status check")}
          </span>
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

  if (missingGrant) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("Waiting for the sandbox to set up free model access.")}
      </p>
    );
  }
  if (!status.data || !access) return null;
  const state =
    agent?.enabled === false ? "available" : (agent?.state ?? access.state);
  const assignedAgent = access.agents ? agentId : access.agentId;
  const isStarting = state === "queued" || state === "starting";
  const denied = access.accessPaused
    ? "Free model access is paused."
    : status.data.enabled !== true
      ? "Free model access is unavailable."
      : status.data.pool_available === false
        ? "The shared free model budget is exhausted."
        : status.data.user_budget_available === false
          ? "Your free model budget is exhausted."
          : undefined;

  function submit(action: "enable" | "revoke") {
    const latest = queryClient.getQueryState(queryKey);
    if (
      submitting.current ||
      latest?.status !== "success" ||
      latest.data !== status.data
    )
      return;
    submitting.current = true;
    changeAccess.mutate(action);
  }

  let notice: string | undefined = denied;
  let activation: ReactNode;
  const requestFailed =
    changeAccess.isError && changeAccess.variables === "enable";
  if (!notice) {
    if (sandboxReady && state === "ready" && assignedAgent === agentId) {
      if (showAuthorization) notice = "Pax free quota is ready.";
    } else if (!sandboxReady || !access.canActivate) {
      if (authorized)
        notice = "Waiting for the sandbox to set up free model access.";
    } else if (
      assignedAgent &&
      assignedAgent !== agentId &&
      (isStarting || state === "ready")
    ) {
      notice =
        "Free model access is assigned to another agent in this sandbox.";
    } else if (
      (changeAccess.isPending && changeAccess.variables === "enable") ||
      isStarting ||
      (authorized && state === "available" && !requestFailed)
    ) {
      notice = "Setting up free model access…";
    } else {
      const failed = requestFailed || state === "failed";
      const failure = requestFailed
        ? ["Free model setup request", "Couldn’t enable free model access."]
        : setupErrorMessage(agent?.reason_code);
      activation = (
        <>
          {failed && (
            <p role="alert" className="text-sm text-warning">
              <span className="block font-medium">{t(failure[0])}</span>
              {t(failure[1])}
            </p>
          )}
          <Button
            disabled={
              status.isFetching ||
              changeAccess.isPending ||
              (state !== "available" && state !== "failed")
            }
            onClick={() => submit("enable")}
          >
            {t(failed ? "Retry free model setup" : "Use Pax free quota")}
          </Button>
        </>
      );
    }
  }

  if (!notice && !activation && !showAuthorizedControls) return null;
  return (
    <div className="space-y-2">
      {showAuthorizedControls && (
        <p className="text-sm font-medium">
          {t("Pax free quota is authorized.")}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink-muted">
          {t(notice)}
        </p>
      )}
      {activation}
      {showAuthorizedControls && (
        <>
          {changeAccess.isError && changeAccess.variables === "revoke" && (
            <p role="alert" className="text-sm text-warning">
              <span className="block font-medium">
                {t("Free model authorization")}
              </span>
              {t("Couldn’t disable Pax free quota.")}
            </p>
          )}
          <Button
            variant="secondary"
            disabled={status.isFetching || changeAccess.isPending}
            onClick={() => submit("revoke")}
          >
            {t(
              changeAccess.isPending && changeAccess.variables === "revoke"
                ? "Disabling Pax free quota…"
                : "Disable Pax free quota",
            )}
          </Button>
        </>
      )}
    </div>
  );
}
