"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  nodeDaemonRuntimeOutcome,
  nodeLabel,
  type NodeDaemonRuntimeTarget,
} from "@/components/resources/resource-models";
import { queryKeys } from "@/features/api/query-keys";
import {
  createNodeDaemonAgentConnection,
  discoverNodeDaemonHarnesses,
  listNodeDaemonAgentConnections,
  restartNodeDaemonAgentConnection,
} from "@/features/api/resources";
import type { Node, NodeDaemonCommandData } from "@/features/api/types";
import { CommandBlock } from "./command-block";

const recipes: Record<
  string,
  { label: string; install: string; instructions: string }
> = {
  codex: {
    label: "Codex",
    install: "npm install -g @agentclientprotocol/codex-acp",
    instructions: "https://github.com/agentclientprotocol/codex-acp#readme",
  },
  "claude-code": {
    label: "Claude Code",
    install: "npm install -g @agentclientprotocol/claude-agent-acp",
    instructions:
      "https://github.com/agentclientprotocol/claude-agent-acp#readme",
  },
};

export function AgentConnectStep({
  node,
  userId,
  onStart,
}: {
  node: Node;
  userId: string;
  onStart?: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [more, setMore] = useState(false);
  const [target, setTarget] = useState<NodeDaemonRuntimeTarget>();
  const [agentId, setAgentId] = useState("");
  const [commandError, setCommandError] = useState<string>();
  const [slow, setSlow] = useState(false);
  const createLock = useRef(false);
  const online = node.online === true;
  // Only one daemon query may be in flight for a node. Discovery runs first;
  // connection polling starts after creation and discovery stays disabled.
  const inventory = useQuery({
    queryKey: [
      ...queryKeys.nodeDaemonHarnesses(userId, node.node_id),
      "onboarding",
    ],
    queryFn: async () => {
      const result = await discoverNodeDaemonHarnesses(userId, node.node_id, {
        probe: true,
      });
      if (result.error)
        throw new Error(
          result.error.message ?? "Couldn't check this computer.",
        );
      return result;
    },
    enabled: online && !target,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const connections = useQuery({
    queryKey: queryKeys.nodeDaemonAgentConnections(userId, node.node_id),
    queryFn: async () => {
      const result = await listNodeDaemonAgentConnections(userId, node.node_id);
      if (result.error)
        throw new Error(
          result.error.message ?? "Couldn't check the connection.",
        );
      return result;
    },
    enabled: online && !!target && !inventory.isFetching,
    refetchOnWindowFocus: false,
    retry: false,
    refetchInterval: (query) => {
      if (!online || !target || query.state.error || slow) return false;
      return nodeDaemonRuntimeOutcome(
        target,
        query.state.data?.agent_connections?.items ?? [],
      )
        ? false
        : 2000;
    },
  });
  const items = inventory.data?.harnesses?.items ?? [];
  const choice = items.find((item) => item.harness === selected);
  const recipe = recipes[selected];
  const label = recipe?.label ?? choice?.display_name ?? selected;
  const available = choice?.state === "available";
  const fallback = choice?.command?.[0]?.split("/").pop() === "npx";
  const outcome = target
    ? nodeDaemonRuntimeOutcome(
        target,
        connections.data?.agent_connections?.items ?? [],
      )
    : undefined;
  const current = connections.data?.agent_connections?.items.find(
    (item) => item.id === target?.connectionId,
  );
  const ready = online && outcome === "running" && !connections.error;

  function record(
    data: NodeDaemonCommandData,
    action: "create" | "restart",
    fallbackId?: string,
  ) {
    const id = data.connection_id ?? fallbackId;
    if (
      !id ||
      data.dispatch_error ||
      data.command_status === "rejected" ||
      data.command_status === "failed"
    ) {
      setCommandError(
        data.dispatch_error ??
          "The connection couldn't be confirmed. Open device settings to check it before trying again.",
      );
      return;
    }
    setSlow(false);
    setCommandError(undefined);
    setTarget({
      action,
      connectionId: id,
      desiredGeneration: data.desired_generation,
      desiredRestartNonce:
        action === "restart" && current ? current.restart_nonce + 1 : undefined,
    });
  }
  const create = useMutation({
    mutationFn: () =>
      createNodeDaemonAgentConnection(userId, node.node_id, {
        agent_type: selected,
        harness: selected,
        name: `${label} on ${nodeLabel(node)}`,
        desired_slots: 2,
      }),
    retry: false,
    onSuccess: (data) => {
      setAgentId(data.agent_id);
      record(data, "create");
    },
  });
  const restart = useMutation({
    mutationFn: () =>
      restartNodeDaemonAgentConnection(
        userId,
        node.node_id,
        target!.connectionId,
      ),
    retry: false,
    onSuccess: async (data) => {
      record(data, "restart", target?.connectionId);
      await connections.refetch();
    },
  });
  useEffect(() => {
    if (!target) return;
    const timer = window.setTimeout(() => setSlow(true), 90_000);
    return () => window.clearTimeout(timer);
  }, [target]);
  useEffect(() => {
    if (!ready) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.userAgents(userId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.agents(userId, node.node_id),
    });
  }, [ready, queryClient, userId, node.node_id]);

  const locked =
    create.isPending || !!target || create.isError || !!commandError;
  const error =
    inventory.error ?? create.error ?? restart.error ?? connections.error;

  return (
    <section className="grid min-w-0 gap-4" aria-label="Connect an agent">
      <div>
        <h2 className="text-lg font-medium">
          {ready ? `${label} is connected` : "Choose your agent"}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {ready
            ? `Connected on ${nodeLabel(node)}.`
            : `Which agent do you want to use on ${nodeLabel(node)}?`}
        </p>
      </div>
      {!online && (
        <p role="status" className="text-sm text-warning">
          {nodeLabel(node)} is offline. Bring it online to check or connect an
          agent.
        </p>
      )}
      {!ready && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Agent type"
        >
          {Object.entries(recipes).map(([value, info]) => (
            <Button
              key={value}
              disabled={locked}
              aria-pressed={selected === value}
              variant={selected === value ? "primary" : "secondary"}
              onClick={() => {
                onStart?.();
                setSelected(value);
              }}
            >
              {info.label}
            </Button>
          ))}
          <Button
            disabled={locked}
            aria-expanded={more}
            onClick={() => {
              onStart?.();
              setMore(!more);
            }}
          >
            More
          </Button>
        </div>
      )}
      {more && !ready && (
        <div className="flex flex-wrap gap-2">
          {items
            .filter((item) => !recipes[item.harness])
            .map((item) => (
              <Button
                key={item.harness}
                disabled={locked}
                aria-pressed={selected === item.harness}
                variant={selected === item.harness ? "primary" : "secondary"}
                onClick={() => {
                  onStart?.();
                  setSelected(item.harness);
                }}
              >
                {item.display_name ?? item.harness}
              </Button>
            ))}
          {!inventory.isFetching &&
            !items.some((item) => !recipes[item.harness]) && (
              <p className="text-sm text-ink-tertiary">
                No other supported agents were reported by this computer.
              </p>
            )}
        </div>
      )}
      {inventory.isFetching && (
        <p role="status" className="text-sm text-ink-muted">
          Checking connection components on {nodeLabel(node)}…
        </p>
      )}
      {selected && !ready && !target && (
        <div className="grid gap-3 rounded-lg border border-hairline bg-canvas p-4">
          <h3 className="font-medium">Connect {label}</h3>
          {!inventory.isFetching && !inventory.error && (
            <>
              <p className="text-sm">
                {!choice
                  ? "This PAX version didn't report support for this agent."
                  : available
                    ? fallback
                      ? "ACP adapter can be downloaded on first connection"
                      : "Connection command found"
                    : recipe
                      ? "ACP adapter needed"
                      : "Connection command wasn't found"}
              </p>
              {available && fallback && (
                <p className="text-sm text-ink-muted">
                  PAX found npx. Connecting will download and run the ACP
                  adapter on {nodeLabel(node)}; it has not been verified yet.
                </p>
              )}
              {!available && recipe && (
                <>
                  <p className="text-sm text-ink-muted">
                    Install the connection component so PAX can communicate with{" "}
                    {label}. This command requires Node.js and npm.
                  </p>
                  <CommandBlock command={recipe.install} />
                  <p className="text-sm text-ink-muted">
                    Run this on {nodeLabel(node)}, then check again.
                  </p>
                </>
              )}
              {!available && !recipe && choice?.install_hint && (
                <p className="text-sm text-ink-muted">{choice.install_hint}</p>
              )}
              {choice?.last_error && (
                <p className="text-sm text-warning">{choice.last_error}</p>
              )}
            </>
          )}
          <p className="text-sm text-ink-muted">
            Agent installation and sign-in aren’t checked here. Make sure{" "}
            {label} is set up and signed in on {nodeLabel(node)} before starting
            a conversation.
          </p>
          {recipe && (
            <a
              href={recipe.instructions}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent-bright underline underline-offset-4"
            >
              View installation instructions
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!online || inventory.isFetching || locked}
              onClick={() => void inventory.refetch()}
            >
              Check again
            </Button>
            {available && (
              <Button
                variant="primary"
                disabled={
                  !online || inventory.isFetching || !!inventory.error || locked
                }
                onClick={() => {
                  if (createLock.current) return;
                  createLock.current = true;
                  onStart?.();
                  create.mutate();
                }}
              >
                {create.isPending ? "Connecting…" : `Connect ${label}`}
              </Button>
            )}
          </div>
        </div>
      )}
      {target && !ready && (
        <div
          className="grid gap-3 rounded-lg border border-hairline bg-canvas p-4"
          aria-live="polite"
        >
          <p className="text-sm">
            {outcome === "failed"
              ? `${label} couldn't start.`
              : slow
                ? "This is taking longer than expected."
                : `Connecting ${label}…`}
          </p>
          <p className="text-sm text-ink-muted">
            {current?.status?.last_error_message ??
              "Waiting for the computer to confirm the connection. Keep this page open."}
          </p>
          {outcome === "failed" && (
            <>
              <p className="text-sm text-ink-muted">
                Check the agent’s installation and sign-in on {nodeLabel(node)},
                then retry this connection.
              </p>
              {recipe && <CommandBlock command={recipe.install} />}
              <div>
                <Button
                  disabled={
                    !online || restart.isPending || connections.isFetching
                  }
                  onClick={() => restart.mutate()}
                >
                  {restart.isPending ? "Retrying…" : "Retry connection"}
                </Button>
              </div>
            </>
          )}
          {(slow || connections.error) && (
            <div>
              <Button
                disabled={!online || connections.isFetching}
                onClick={() => void connections.refetch()}
              >
                Check connection
              </Button>
            </div>
          )}
        </div>
      )}
      {error && <InlineError error={error} />}
      {inventory.error && !selected && (
        <div>
          <Button
            disabled={!online || inventory.isFetching}
            onClick={() => void inventory.refetch()}
          >
            Check again
          </Button>
        </div>
      )}
      {commandError && (
        <p role="alert" className="text-sm text-warning">
          {commandError}
        </p>
      )}
      {create.isError && (
        <p className="text-sm text-ink-muted">
          The request may have reached your computer. Check its connections
          before creating another agent.
        </p>
      )}
      {(target || commandError || create.isError) && (
        <div className="flex flex-wrap gap-2">
          {ready && agentId && (
            <Button asChild variant="primary">
              <Link
                href={`/sessions/new?agentId=${encodeURIComponent(agentId)}&nodeId=${encodeURIComponent(node.node_id)}`}
              >
                Start a conversation
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={`/nodes/${encodeURIComponent(node.node_id)}`}>
              Manage connections
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
