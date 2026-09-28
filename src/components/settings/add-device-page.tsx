"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  createNodeRegistrationToken,
  useNodes,
} from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { nodeLabel } from "@/components/resources/resource-models";
import { SettingsBack, settingsLinks } from "./settings-navigation";
import { buildDeviceInstallCommand } from "./add-device-command";

export function AddDevicePage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <AddDeviceContent user={user} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function AddDeviceContent({ user }: { user: User }) {
  const [mode, setMode] = useState<"quick" | "pair">("quick");
  const [command, setCommand] = useState("");
  const [expiresAt, setExpiresAt] = useState<number>();
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error>();
  const [baseline, setBaseline] = useState<string[]>([]);
  const nodesQuery = useNodes(user.user_id, command && !expired ? 3000 : 15000);
  const discovered = command
    ? (nodesQuery.data?.nodes ?? []).filter(
        (node) => !baseline.includes(node.node_id),
      )
    : [];

  useEffect(() => {
    if (!expiresAt) return;
    const delay = expiresAt - Date.now();
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function generate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setCopied(false);
    try {
      const nodes = await nodesQuery.refetch();
      if (nodes.error || !nodes.data)
        throw (
          nodes.error ?? new Error("Device list is unavailable. Try again.")
        );
      const created = await createNodeRegistrationToken(user.user_id, 3600);
      setBaseline(nodes.data.nodes.map((node) => node.node_id));
      setCommand(buildDeviceInstallCommand(created.token));
      setExpiresAt(
        created.expires_at
          ? Date.parse(created.expires_at)
          : Date.now() + 3600_000,
      );
      setExpired(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(undefined);
    } catch {
      setError(
        new Error(
          "Copy is unavailable. Select the command and copy it manually.",
        ),
      );
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <SettingsBack href={settingsLinks.devices} label="Devices" />
        <h1 className="text-2xl font-semibold">Add device</h1>
        <p className="mt-2 text-sm text-ink-tertiary">
          Connect a computer or server to your account.
        </p>
        <div
          className="my-6 grid grid-cols-2 gap-1 rounded-lg border border-hairline p-1"
          role="group"
          aria-label="Connection method"
        >
          {(
            [
              ["quick", "Quick connect"],
              ["pair", "Pair with code"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setCopied(false);
              }}
              variant={mode === value ? "secondary" : "ghost"}
              className={
                mode === value
                  ? "justify-center bg-accent/10"
                  : "justify-center"
              }
            >
              {label}
            </Button>
          ))}
        </div>
        {mode === "quick" ? (
          <>
            <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5">
              <h2 className="font-medium">1. Generate your command</h2>
              <p className="text-sm text-ink-tertiary">
                Install paxl and paxd, connect to this account, and start the
                background service with one command. No additional pairing
                approval is needed.
              </p>
              {command && !expired && (
                <>
                  <pre className="select-text whitespace-pre-wrap break-all rounded-lg border border-hairline bg-canvas p-3 text-xs leading-6">
                    {command}
                  </pre>
                  <Button
                    onClick={() => void copy(command)}
                    icon={
                      copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )
                    }
                    variant="primary"
                  >
                    {copied ? "Copied" : "Copy command"}
                  </Button>
                </>
              )}
              {expired && (
                <p role="status" className="text-sm text-warning">
                  This command has expired. Generate a new one if the device has
                  not connected.
                </p>
              )}
              {(!command || expired) && (
                <Button
                  disabled={busy}
                  onClick={() => void generate()}
                  variant="primary"
                >
                  {busy
                    ? "Generating..."
                    : command
                      ? "Generate new command"
                      : "Generate command"}
                </Button>
              )}
              <p className="text-xs text-ink-tertiary">
                Use this command only on your own computer. It can register one
                device, once.
              </p>
            </section>
            <section className="mt-5 grid gap-3">
              <h2 className="font-medium">2. Run it in your terminal</h2>
              <p className="text-sm text-ink-tertiary">
                Paste the command into Terminal on your Mac or Linux computer.
                Keep this page open to see newly registered devices.
              </p>
            </section>
            {command && (
              <section
                className="mt-5 rounded-lg border border-hairline p-4"
                aria-live="polite"
              >
                <h2 className="text-sm font-medium">
                  {discovered.length
                    ? "New devices detected"
                    : "Waiting for a new device"}
                </h2>
                <p className="mt-1 text-xs text-ink-tertiary">
                  Devices registered since this command was generated appear
                  below. Open the matching device to manage its agents.
                </p>
                {discovered.map((node) => (
                  <Link
                    key={node.node_id}
                    href={`/nodes/${encodeURIComponent(node.node_id)}`}
                    className="mt-3 block text-sm text-accent-bright"
                  >
                    {nodeLabel(node)} ·{" "}
                    {node.online === true
                      ? "Online"
                      : node.online === false
                        ? "Offline"
                        : "Status unknown"}
                  </Link>
                ))}
              </section>
            )}
          </>
        ) : (
          <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5">
            <h2 className="font-medium">1. Start pairing on your computer</h2>
            <p className="text-sm text-ink-tertiary">
              If paxl is installed, run this in your terminal:
            </p>
            <pre className="select-text rounded-lg border border-hairline bg-canvas p-3 text-sm">
              paxl daemon setup
            </pre>
            <Button
              onClick={() => void copy("paxl daemon setup")}
              icon={<Copy className="h-4 w-4" />}
            >
              {copied ? "Copied" : "Copy pairing command"}
            </Button>
            <h2 className="mt-2 font-medium">2. Confirm the pairing request</h2>
            <p className="text-sm text-ink-tertiary">
              Open the link shown in the terminal, or enter its six-character
              code on the pairing page. Review the computer and account before
              approving.
            </p>
            <Button asChild variant="primary">
              <Link href="/connect">Open pairing page</Link>
            </Button>
          </section>
        )}
        {error && (
          <div className="mt-4">
            <InlineError error={error} />
          </div>
        )}
        {nodesQuery.error && (
          <div className="mt-4">
            <InlineError error={nodesQuery.error} />
          </div>
        )}
      </div>
    </div>
  );
}
