"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  isDeviceNode,
  nodeLabel,
} from "@/components/resources/resource-models";
import { buildDeviceInstallCommand } from "@/components/settings/add-device-command";
import {
  createNodeRegistrationToken,
  useNodes,
} from "@/features/api/resources";
import type { Node } from "@/features/api/types";
import { CommandBlock } from "./command-block";

type Method = "quick" | "browser";
type Attempt = { command: string; expiresAt?: number; onlineBefore: string[] };

export function DeviceConnectStep({
  userId,
  onConnected,
  onStart,
}: {
  userId: string;
  onConnected: (node: Node) => void;
  onStart?: () => void;
}) {
  const [method, setMethod] = useState<Method>("quick");
  // Registration tokens live only in this mounted component, never in a URL,
  // persistent storage, or TanStack Query's cache.
  const [attempt, setAttempt] = useState<Attempt>();
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<Error>();
  const nodes = useNodes(userId, attempt ? 3000 : 15000);
  const candidates = attempt
    ? (nodes.data?.nodes ?? []).filter(
        (node) =>
          isDeviceNode(node) &&
          node.online === true &&
          !attempt.onlineBefore.includes(node.node_id),
      )
    : [];

  useEffect(() => {
    if (!attempt?.expiresAt) return;
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.max(0, attempt.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [attempt]);

  async function prepare(nextMethod: Method) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    onStart?.();
    try {
      const baseline = await nodes.refetch();
      if (baseline.error || !baseline.data)
        throw (
          baseline.error ?? new Error("Device list is unavailable. Try again.")
        );
      const registration =
        nextMethod === "quick"
          ? await createNodeRegistrationToken(userId, 3600)
          : undefined;
      const parsedExpiry = registration?.expires_at
        ? Date.parse(registration.expires_at)
        : NaN;
      setAttempt({
        command: buildDeviceInstallCommand(registration?.token),
        expiresAt: registration
          ? Number.isFinite(parsedExpiry)
            ? parsedExpiry
            : Date.now() + 3600_000
          : undefined,
        onlineBefore: baseline.data.nodes
          .filter((node) => node.online === true)
          .map((node) => node.node_id),
      });
      setExpired(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Connect your computer">
      <div>
        <h2 className="text-lg font-medium">Connect your computer</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Run the command on the computer or server where you want your agent to
          run.
        </p>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Connection method"
      >
        {(
          [
            ["quick", "Quick connect (Recommended)"],
            ["browser", "Browser sign-in"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            aria-pressed={method === value}
            disabled={busy}
            variant={method === value ? "primary" : "secondary"}
            onClick={() => {
              if (method === value) return;
              setMethod(value);
              setAttempt(undefined);
              setExpired(false);
              setError(undefined);
              if (value === "browser") void prepare(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-ink-muted">
        {method === "quick"
          ? "Install PAX and connect this computer to your account with one command."
          : "Install PAX, then follow the sign-in link shown in your terminal."}
      </p>
      <p className="text-xs text-ink-tertiary">
        For macOS and Linux. Installs paxl and paxd, then starts the background
        service.
      </p>
      {attempt && !expired && (
        <CommandBlock key={attempt.command} command={attempt.command} />
      )}
      {expired && (
        <p role="status" className="text-sm text-warning">
          This command has expired. Generate a new command to continue.
        </p>
      )}
      {(!attempt || expired) && (
        <div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void prepare(method)}
          >
            {busy
              ? "Generating…"
              : expired
                ? "Generate new command"
                : "Generate command"}
          </Button>
        </div>
      )}
      {attempt && (
        <>
          <p className="text-sm text-ink-muted">
            {method === "quick"
              ? "Paste it into your terminal and run it. Keep this page open."
              : "After signing in, return here to continue."}
          </p>
          {method === "quick" && (
            <p className="text-xs text-ink-tertiary">
              Use this command on your own computer. It can connect one device,
              once.
            </p>
          )}
          <div
            className="grid gap-3 rounded-lg border border-hairline bg-canvas p-4"
            aria-live="polite"
          >
            <p className="text-sm">
              {candidates.length
                ? "A computer is online. Choose yours to continue."
                : "Waiting for your computer to connect…"}
            </p>
            {candidates.map((node) => (
              <Button
                key={node.node_id}
                variant="primary"
                onClick={() => onConnected(node)}
              >
                Continue with {nodeLabel(node)}
              </Button>
            ))}
            {!candidates.length && (
              <p className="text-xs text-ink-tertiary">
                This page checks automatically. If installation fails, fix the
                error shown in your terminal and run the command again.
              </p>
            )}
          </div>
        </>
      )}
      {(error || nodes.error) && <InlineError error={error ?? nodes.error!} />}
    </section>
  );
}
