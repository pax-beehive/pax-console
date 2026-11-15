"use client";

import {
  isDeviceNode,
  nodeLabel,
} from "@/components/resources/resource-models";
import { useAgents, useNodes } from "@/features/api/resources";
import {
  signInKey,
  useAgentSignInStates,
  type AgentSignInTarget,
} from "@/features/devices/use-agent-sign-in-states";
import { supportsAgentSignIn } from "./agent-sign-in-methods";
import { agentTypeLabel, normalizeAgentType } from "./agent-types";
import { settingsLinks } from "./settings-catalog";

/** An agent type that has to sign in again, and the device it runs on. */
export type AgentNeedingSignIn = AgentSignInTarget & { deviceName: string };

/** The sign-in page, opened on one device and agent type. */
export function agentSignInHref({ nodeId, agentType }: AgentSignInTarget) {
  return `${settingsLinks.agentSignIn}?${new URLSearchParams({ node_id: nodeId, harness: agentType })}`;
}

/**
 * Agent types that are signed out on one of the account's devices, ordered by
 * device name and then agent name. Sign-in belongs to an agent type on a
 * device and only an online device answers, so offline devices and pairs that
 * could not be checked are left out rather than guessed.
 */
export function useAgentsNeedingSignIn(userId: string): AgentNeedingSignIn[] {
  const devices = useNodes(userId, 60_000).data?.nodes?.filter(isDeviceNode);
  const agents = useAgents(userId, "owned").data?.agents;
  const candidates = (devices ?? [])
    .filter((node) => node.online)
    .flatMap((node) =>
      [
        ...new Set(
          (agents ?? [])
            .filter((agent) => agent.node_id === node.node_id)
            .map((agent) => normalizeAgentType(agent.agent_type))
            .filter(
              (type): type is string => !!type && supportsAgentSignIn(type),
            ),
        ),
      ].map((agentType) => ({
        nodeId: node.node_id,
        agentType,
        deviceName: nodeLabel(node),
      })),
    )
    .sort(
      (a, b) =>
        a.deviceName.localeCompare(b.deviceName) ||
        a.nodeId.localeCompare(b.nodeId) ||
        agentTypeLabel(a.agentType).localeCompare(agentTypeLabel(b.agentType)),
    );
  const signIn = useAgentSignInStates(userId, candidates);
  return candidates.filter(
    (candidate) => signIn[signInKey(candidate)] === "signed-out",
  );
}
