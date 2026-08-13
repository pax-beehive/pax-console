"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, KeyRound, RefreshCw } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgents, useNodes } from "@/features/api/resources";
import type { Agent, Node, User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  approveBrowserPairing,
  beginBrowserPairing,
  browserPairingInstructions,
  finishBrowserPairing,
  listE2EEPairingRequests,
  listPendingPairings,
  type BrowserPairingInstructions,
  type E2EEPairingRequest,
} from "@/features/e2ee/key-distribution";
import { loadRootKey } from "@/features/e2ee/root-key-store";
import { compactId } from "@/lib/format";

export function E2EEPairingRoute() {
  return <AuthGate>{(user) => <E2EEPairingPage user={user} />}</AuthGate>;
}

type AccessMethod = "paxd" | "device";

function E2EEPairingPage({ user }: { user: User }) {
  const searchParams = useSearchParams();
  const requestedAgentId = searchParams.get("agentId") ?? "";
  const agentsQuery = useAgents(user.user_id, "owned");
  const nodesQuery = useNodes(user.user_id);
  const agents = agentsQuery.data?.agents ?? [];
  const nodes = nodesQuery.data?.nodes ?? [];
  const [agentId, setAgentId] = useState(requestedAgentId);
  const selectedAgentId = agents.some((agent) => agent.agent_id === agentId)
    ? agentId
    : (agents[0]?.agent_id ?? "");
  const [configured, setConfigured] = useState(false);
  const [instructions, setInstructions] =
    useState<BrowserPairingInstructions>();
  const [accessMethod, setAccessMethod] = useState<AccessMethod>();
  const [requests, setRequests] = useState<E2EEPairingRequest[]>([]);
  const [approvalSecrets, setApprovalSecrets] = useState<
    Record<string, string>
  >({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }
    let active = true;
    void Promise.all([
      loadRootKey(selectedAgentId),
      listE2EEPairingRequests(user.user_id, selectedAgentId),
      listPendingPairings(selectedAgentId),
    ])
      .then(([rootKey, pending, localPending]) => {
        if (active) {
          setConfigured(Boolean(rootKey));
          setRequests(pending);
          setInstructions(
            !rootKey && localPending.length > 0
              ? browserPairingInstructions(localPending[0])
              : undefined,
          );
          setAccessMethod(undefined);
        }
      })
      .catch((error) => active && setStatus(errorMessage(error)));
    return () => {
      active = false;
    };
  }, [selectedAgentId, user.user_id]);

  async function startPairing() {
    setBusy(true);
    setStatus("");
    try {
      const result = await beginBrowserPairing(
        user.user_id,
        selectedAgentId,
        browserDeviceName(),
      );
      setInstructions({
        pairingId: result.request.pairing_id,
        pairingSecret: result.pairingSecret,
        localCommand: result.localCommand,
      });
      setStatus(
        "Encryption access requested. Choose how to grant access to this browser.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!accessMethod || !instructions || configured) {
      return;
    }
    let active = true;
    let checking = false;
    const poll = async () => {
      if (checking) return;
      checking = true;
      try {
        await finishBrowserPairing(
          user.user_id,
          selectedAgentId,
          instructions.pairingId,
        );
        if (active) {
          setConfigured(true);
          setInstructions(undefined);
          setAccessMethod(undefined);
          setStatus(
            "Encryption access granted. This browser can now open encrypted sessions.",
          );
        }
      } catch {
        // The key package is expected to be unavailable until either approval
        // method completes. Keep waiting without turning that state into an error.
      } finally {
        checking = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessMethod, configured, instructions, selectedAgentId, user.user_id]);

  async function refreshRequests() {
    setBusy(true);
    try {
      setRequests(await listE2EEPairingRequests(user.user_id, selectedAgentId));
      setStatus("Device requests refreshed.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function approve(request: E2EEPairingRequest) {
    setBusy(true);
    setStatus("");
    try {
      await approveBrowserPairing(
        user.user_id,
        request,
        approvalSecrets[request.pairing_id] ?? "",
      );
      setRequests((current) =>
        current.filter((item) => item.pairing_id !== request.pairing_id),
      );
      setStatus(
        `Encryption access granted to ${request.device_name || request.device_id}.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleLayout user={user}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-5xl gap-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-ink-tertiary">
                <KeyRound className="h-4 w-4" /> Encryption access
              </div>
              <h1 className="mt-2 text-2xl font-semibold">
                Get encryption access
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-ink-muted">
                Add this browser, or grant encryption access to another device.
              </p>
            </div>
            <Button asChild icon={<ArrowLeft className="h-4 w-4" />}>
              <Link href="/settings/security">Security settings</Link>
            </Button>
          </header>

          <section className="grid gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="grid min-w-64 gap-1 text-xs text-ink-tertiary">
                Your agent
                <select
                  className="h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
                  onChange={(event) => {
                    setAgentId(event.target.value);
                    setInstructions(undefined);
                    setAccessMethod(undefined);
                    setStatus("");
                  }}
                  value={selectedAgentId}
                >
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agentLabel(agent, nodes)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={configured ? "success" : "neutral"}>
                  {configured ? "encryption access" : "access required"}
                </Badge>
                <Button
                  disabled={
                    busy ||
                    !selectedAgentId ||
                    configured ||
                    Boolean(instructions)
                  }
                  onClick={() => void startPairing()}
                  variant="primary"
                >
                  {configured ? "This browser is ready" : "Add this browser"}
                </Button>
              </div>
            </div>

            {instructions && (
              <div className="grid gap-3 rounded-lg border border-accent/40 bg-canvas p-4">
                <p className="text-sm font-medium">
                  This browser doesn&apos;t have the encryption key
                </p>
                <p className="text-xs leading-5 text-ink-tertiary">
                  Choose either method below. Both grant access to the same
                  encrypted sessions and do not create, replace, or rotate the
                  encryption key.
                </p>
                {!accessMethod ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      className="rounded-lg border border-accent/40 bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2"
                      onClick={() => {
                        setAccessMethod("paxd");
                        setStatus("");
                      }}
                      type="button"
                    >
                      <span className="text-sm font-medium">
                        Get access from the paxd computer
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-ink-tertiary">
                        Recommended. This also works when no other browser still
                        has encryption access.
                      </span>
                    </button>
                    <button
                      className="rounded-lg border border-hairline bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2"
                      onClick={() => {
                        setAccessMethod("device");
                        setStatus("");
                      }}
                      type="button"
                    >
                      <span className="text-sm font-medium">
                        Get access from another device
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-ink-tertiary">
                        Use a browser or device that can already open encrypted
                        sessions for this agent.
                      </span>
                    </button>
                  </div>
                ) : accessMethod === "paxd" ? (
                  <div className="rounded-lg border border-accent/40 bg-surface-1 p-4">
                    <h2 className="text-sm font-medium">
                      Get access from the paxd computer
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-ink-tertiary">
                      Run this command on the computer where paxd manages the
                      selected agent. paxd uses its existing encryption seed;
                      existing encrypted sessions remain accessible.
                    </p>
                    <div className="mt-3">
                      <SecretRow
                        label="Command to run on the paxd computer"
                        displayValue={maskPairingSecret(
                          instructions.localCommand,
                          instructions.pairingSecret,
                        )}
                        value={instructions.localCommand}
                      />
                    </div>
                    <p className="mt-3 text-xs text-ink-tertiary">
                      The secret is masked on screen. Copy places the complete,
                      runnable command on your clipboard.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-accent/40 bg-surface-1 p-4">
                    <h2 className="text-sm font-medium">
                      Get access from another device
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-ink-tertiary">
                      On a device that can already open encrypted sessions, go
                      to Settings → Security, select this agent, find this
                      browser&apos;s request, enter the one-time code, and grant
                      encryption access.
                    </p>
                    <div className="mt-3">
                      <SecretRow
                        label="One-time code"
                        value={instructions.pairingSecret}
                      />
                    </div>
                    <p className="mt-3 text-xs text-ink-tertiary">
                      This code authorizes only this request. It is not the
                      encryption key and expires with the request.
                    </p>
                  </div>
                )}
                {accessMethod && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-1 p-3">
                    <div>
                      <p className="text-sm font-medium">
                        Waiting for encryption access…
                      </p>
                      <p className="mt-1 text-xs text-ink-tertiary">
                        This page will finish automatically after access is
                        granted.
                      </p>
                    </div>
                    <div>
                      <Button onClick={() => setAccessMethod(undefined)}>
                        Choose another method
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">
                  Encryption access requests
                </h2>
                <p className="mt-1 text-xs text-ink-tertiary">
                  This browser can grant access only when it already has the
                  encryption key. Enter the one-time code shown on the new
                  device before granting access.
                </p>
              </div>
              <Button
                disabled={busy || !selectedAgentId || !configured}
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => void refreshRequests()}
              >
                Refresh
              </Button>
            </div>
            {!configured ? (
              <p className="rounded-md border border-hairline bg-canvas p-3 text-sm text-ink-tertiary">
                Add this browser first before using it to grant encryption
                access to another device.
              </p>
            ) : requests.length === 0 ? (
              <p className="text-sm text-ink-tertiary">
                No devices are waiting for approval.
              </p>
            ) : (
              requests.map((request) => (
                <div
                  className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
                  key={request.pairing_id}
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {request.device_name || request.device_id}
                    </div>
                    <div className="mt-1 font-mono text-xs text-ink-tertiary">
                      {compactId(request.device_id, 12, 6)} · epoch{" "}
                      {request.key_epoch}
                    </div>
                  </div>
                  <label className="grid gap-1 text-xs text-ink-tertiary">
                    One-time code from new device
                    <input
                      autoComplete="off"
                      className="h-9 rounded-md border border-hairline bg-surface-1 px-3 font-mono text-sm text-ink"
                      onChange={(event) =>
                        setApprovalSecrets((current) => ({
                          ...current,
                          [request.pairing_id]: event.target.value,
                        }))
                      }
                      type="password"
                      value={approvalSecrets[request.pairing_id] ?? ""}
                    />
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !(approvalSecrets[request.pairing_id] ?? "").trim()
                    }
                    onClick={() => void approve(request)}
                    variant="primary"
                  >
                    Grant encryption access
                  </Button>
                </div>
              ))
            )}
          </section>

          {status && (
            <p className="rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
              {status}
            </p>
          )}
        </div>
      </div>
    </ConsoleLayout>
  );
}

function SecretRow({
  displayValue,
  label,
  value,
}: {
  displayValue?: string;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-tertiary">
        {label}
        <Button
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => setCopied(true));
          }}
          size="sm"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-hairline bg-surface-1 p-3 text-xs leading-5">
        {displayValue ?? value}
      </pre>
    </div>
  );
}

function browserDeviceName() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform || navigator.platform;
  return `${navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser"} on ${platform || "device"}`;
}

function agentLabel(agent: Agent, nodes: Node[]) {
  const node = nodes.find((item) => item.node_id === agent.node_id);
  const nodeName =
    node?.name || node?.hostname || agent.node_id || "Unknown node";
  return `${agent.name || agent.agent_type || "Agent"} · ${nodeName} · ${compactId(agent.agent_id, 8, 5)}`;
}

function maskPairingSecret(command: string, pairingSecret: string) {
  return command.replace(pairingSecret, "***");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
