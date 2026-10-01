"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgents, useNodes } from "@/features/api/resources";
import type { Agent, Node, User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  approveBrowserPairing,
  listE2EEPairingRequests,
  type E2EEPairingRequest,
} from "@/features/e2ee/key-distribution";
import { useBrowserPairing } from "@/features/e2ee/use-browser-pairing";
import { compactId } from "@/lib/format";
import {
  SecretValue,
  ShortCodeApprover,
  ShortCodeRecipient,
} from "./short-code-access";

export function E2EEPairingRoute() {
  return <AuthGate>{(user) => <E2EEPairingPage user={user} />}</AuthGate>;
}
function E2EEPairingPage({ user }: { user: User }) {
  const params = useSearchParams();
  const agentsQuery = useAgents(user.user_id, "owned");
  const nodesQuery = useNodes(user.user_id);
  const agents = agentsQuery.data?.agents ?? [];
  const nodes = nodesQuery.data?.nodes ?? [];
  const [agentId, setAgentId] = useState(params.get("agentId") ?? "");
  const selected = agents.some((a) => a.agent_id === agentId)
    ? agentId
    : (agents[0]?.agent_id ?? "");
  return (
    <ConsoleLayout user={user}>
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid w-full min-w-0 max-w-2xl gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">Encryption access</h1>
            <Button asChild icon={<ArrowLeft className="h-4 w-4" />}>
              <Link href="/settings/advanced/encryption">Encrypted chats</Link>
            </Button>
          </header>
          <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
            Your agent
            <select
              className="h-10 w-full min-w-0 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
              value={selected}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agentLabel(agent, nodes)}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <DeviceAccess
              key={`${user.user_id}:${selected}`}
              userId={user.user_id}
              agentId={selected}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              {agentsQuery.isLoading
                ? "Loading agents…"
                : "No agents available."}
            </p>
          )}
        </div>
      </div>
    </ConsoleLayout>
  );
}
function DeviceAccess({
  userId,
  agentId,
}: {
  userId: string;
  agentId: string;
}) {
  const pairing = useBrowserPairing(userId, agentId);
  const ready = pairing.state.phase === "ready";
  const instructions = pairing.state.instructions;
  const pending = pairing.state.pending;
  const activeShort =
    instructions && pending?.shortCode && pending.shortCode.serverCreatedAt;
  const [commandOpen, setCommandOpen] = useState(false);
  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={ready ? "success" : "neutral"}>
          {ready ? "This device is authorized" : "Access required"}
        </Badge>
        <Button disabled={pairing.busy} onClick={() => void pairing.refresh()}>
          Check again
        </Button>
      </div>
      {pairing.state.message && (
        <p role="status" className="break-words text-sm text-ink-muted">
          {pairing.state.message}
        </p>
      )}
      {ready ? (
        <>
          <Button disabled>This device is ready</Button>
          <ShortCodeApprover userId={userId} agentId={agentId} />
          <LegacyRequests userId={userId} agentId={agentId} />
        </>
      ) : (
        <>
          {activeShort && pending ? (
            <ShortCodeRecipient
              key={pending.pairingId}
              userId={userId}
              pending={pending}
              onEnded={() => void pairing.refresh()}
            />
          ) : instructions ? (
            <div className="grid min-w-0 gap-3">
              <Button onClick={() => setCommandOpen((v) => !v)}>
                Get access from the paxd computer
              </Button>
              {commandOpen && (
                <SecretValue
                  label="Run on the paxd computer"
                  value={instructions.localCommand}
                />
              )}
              <p className="text-sm text-ink-muted">
                Waiting for encryption access…
              </p>
            </div>
          ) : null}
          <Button
            variant="primary"
            disabled={pairing.busy || pairing.state.phase === "loading"}
            onClick={() => {
              setCommandOpen(false);
              void pairing.start(pairingDeviceName(), true);
            }}
          >
            {instructions || pairing.state.phase === "unconfirmed"
              ? "Create new request"
              : "Authorize this device"}
          </Button>
          {(!instructions || activeShort) && (
            <Button
              disabled={pairing.busy || pairing.state.phase === "loading"}
              onClick={() => {
                setCommandOpen(true);
                void pairing.start(pairingDeviceName());
              }}
            >
              Use paxd command instead
            </Button>
          )}
        </>
      )}
    </section>
  );
}
// Preserve approval for requests created by older consoles during rollout.
function LegacyRequests({
  userId,
  agentId,
}: {
  userId: string;
  agentId: string;
}) {
  const [requests, setRequests] = useState<E2EEPairingRequest[]>([]);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    void listE2EEPairingRequests(userId, agentId)
      .then((requests) => {
        if (active)
          setRequests(
            requests.filter((r) => r.protocol_version !== "short-code-v2"),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, agentId]);
  if (!requests.length) return null;
  return (
    <details className="min-w-0 border-t border-hairline pt-3">
      <summary className="cursor-pointer text-sm">
        Older device requests
      </summary>
      <div className="mt-3 grid min-w-0 gap-3">
        {requests.map((request) => (
          <div key={request.pairing_id} className="grid min-w-0 gap-2">
            <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
              {request.device_name || "New device"}
              <input
                aria-label={`Secret for ${request.device_name || request.device_id}`}
                className="h-10 min-w-0 rounded-md border border-hairline bg-canvas px-3"
                autoComplete="off"
                type={visible ? "text" : "password"}
                value={secrets[request.pairing_id] ?? ""}
                onChange={(event) =>
                  setSecrets((values) => ({
                    ...values,
                    [request.pairing_id]: event.target.value,
                  }))
                }
              />
            </label>
            <Button
              disabled={busy || !secrets[request.pairing_id]}
              onClick={() => {
                setBusy(true);
                void approveBrowserPairing(
                  userId,
                  request,
                  secrets[request.pairing_id],
                )
                  .then(() =>
                    setRequests((values) =>
                      values.filter((r) => r.pairing_id !== request.pairing_id),
                    ),
                  )
                  .catch((error) =>
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : "Please try again.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Authorize device
            </Button>
          </div>
        ))}
        <Button onClick={() => setVisible((v) => !v)}>
          {visible ? "Hide code" : "Show code"}
        </Button>
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
      </div>
    </details>
  );
}

function pairingDeviceName() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform || navigator.platform;
  return platform ? `Device on ${platform}` : "This device";
}

function agentLabel(agent: Agent, nodes: Node[]) {
  const node = nodes.find((item) => item.node_id === agent.node_id);
  const nodeName =
    node?.name || node?.hostname || agent.node_id || "Unknown node";
  return `${agent.name || agent.agent_type || "Agent"} · ${nodeName} · ${compactId(agent.agent_id, 8, 5)}`;
}
