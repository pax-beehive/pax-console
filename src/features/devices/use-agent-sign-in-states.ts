"use client";

import { useEffect, useState } from "react";
import { getNodeHarnessAuth } from "@/features/api/resources";
import type { LoginHarness } from "@/features/api/types";

export type AgentSignInState = "signed-in" | "signed-out";
export type AgentSignInTarget = { nodeId: string; agentType: LoginHarness };

/** The key of a device and agent type pair in the returned states. */
export const signInKey = (target: AgentSignInTarget) =>
  `${target.nodeId}/${target.agentType}`;

/**
 * Whether each agent type is signed in on its device, read once from the
 * device. Only that yes/no is kept: no account detail or sign-in challenge
 * stays in memory. A pair that cannot be checked is left out, so the caller
 * shows nothing rather than a guess. Pass only pairs on online devices.
 */
export function useAgentSignInStates(
  userId: string,
  targets: readonly AgentSignInTarget[],
): Record<string, AgentSignInState | undefined> {
  const [states, setStates] = useState<Record<string, AgentSignInState>>({});
  const keys = targets.map(signInKey).sort().join(",");
  useEffect(() => {
    if (!keys) return;
    const controller = new AbortController();
    for (const key of keys.split(",")) {
      const [nodeId, agentType] = key.split("/");
      getNodeHarnessAuth(
        userId,
        nodeId,
        agentType,
        undefined,
        controller.signal,
      )
        .then(({ harness_auth: view }) => {
          if (controller.signal.aborted || view.logged_in === undefined) return;
          setStates((current) => ({
            ...current,
            [key]: view.logged_in ? "signed-in" : "signed-out",
          }));
        })
        .catch(() => {
          /* The hint is optional; the sign-in page reports failures. */
        });
    }
    return () => controller.abort();
  }, [keys, userId]);
  // A pair that is no longer asked for, such as on a device that went
  // offline, drops out even though its last answer is still held.
  return Object.fromEntries(
    keys
      .split(",")
      .filter((key) => key && states[key])
      .map((key) => [key, states[key]]),
  );
}
