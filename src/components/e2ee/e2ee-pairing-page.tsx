"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgents } from "@/features/api/resources";
import type { Agent, User } from "@/features/api/types";
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

function E2EEPairingPage({ user }: { user: User }) {
  const searchParams = useSearchParams();
  const requestedAgentId = searchParams.get("agentId") ?? "";
  const agentsQuery = useAgents(user.user_id, "owned");
  const agents = agentsQuery.data?.agents ?? [];
  const [agentId, setAgentId] = useState(requestedAgentId);
  const selectedAgentId = agents.some((agent) => agent.agent_id === agentId)
    ? agentId
    : (agents[0]?.agent_id ?? "");
  const [configured, setConfigured] = useState(false);
  const [instructions, setInstructions] =
    useState<BrowserPairingInstructions>();
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
        "Pairing request created. Run the local command, then check the package.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkPackage() {
    if (!instructions) return;
    setBusy(true);
    setStatus("");
    try {
      await finishBrowserPairing(
        user.user_id,
        selectedAgentId,
        instructions.pairingId,
      );
      setConfigured(true);
      setInstructions(undefined);
      setStatus("Agent root key unwrapped and saved in this browser.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshRequests() {
    setBusy(true);
    try {
      setRequests(await listE2EEPairingRequests(user.user_id, selectedAgentId));
      setStatus("Pending device requests refreshed.");
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
      setStatus(`Approved ${request.device_name || request.device_id}.`);
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
                <KeyRound className="h-4 w-4" /> Browser key distribution
              </div>
              <h1 className="mt-2 text-2xl font-semibold">Pair E2EE device</h1>
              <p className="mt-1 max-w-3xl text-sm text-ink-muted">
                The Manager stores only public requests and wrapped key
                packages. The agent root key is unwrapped only in this browser.
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
                    setStatus("");
                  }}
                  value={selectedAgentId}
                >
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agentLabel(agent)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <Badge tone={configured ? "success" : "neutral"}>
                  {configured ? "key available" : "not paired"}
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
                  {configured ? "Browser paired" : "Pair this browser"}
                </Button>
              </div>
            </div>

            {instructions && (
              <div className="grid gap-3 rounded-lg border border-accent/40 bg-canvas p-4">
                <p className="text-sm font-medium">
                  Confirm on the paxd machine
                </p>
                <SecretRow
                  label="One-time pairing secret"
                  value={instructions.pairingSecret}
                />
                <SecretRow
                  label="Local command"
                  value={instructions.localCommand}
                />
                <div>
                  <Button
                    disabled={busy}
                    icon={<Check className="h-4 w-4" />}
                    onClick={() => void checkPackage()}
                    variant="primary"
                  >
                    Check wrapped package
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="grid gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Approve another browser</h2>
                <p className="mt-1 text-xs text-ink-tertiary">
                  Enter the one-time secret shown by the new browser. paxd is
                  not needed after one browser already holds this agent key.
                </p>
              </div>
              <Button
                disabled={busy || !selectedAgentId}
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => void refreshRequests()}
              >
                Refresh
              </Button>
            </div>
            {requests.length === 0 ? (
              <p className="text-sm text-ink-tertiary">No pending requests.</p>
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
                    Secret from new browser
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
                    Approve
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

function SecretRow({ label, value }: { label: string; value: string }) {
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
        {value}
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

function agentLabel(agent: Agent) {
  return `${agent.name || agent.agent_type || "Agent"} · ${compactId(agent.agent_id, 8, 5)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
