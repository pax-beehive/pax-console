"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { compactId } from "@/lib/format";
import { useNodes } from "@/features/api/resources";
import type { HarnessLoginMethod, LoginHarness } from "@/features/api/types";
import {
  isActiveNode,
  isDeviceNode,
  nodeLabel,
} from "@/components/resources/resource-models";
import { SettingsBack, SettingsPageHeader } from "./settings-navigation";
import { settingsSection } from "./settings-catalog";
import {
  loginPending,
  safeAuthorizationUrl,
  useAgentSignIn,
  validLoginSecret,
} from "./agent-sign-in-flow";

const fieldClass =
  "min-h-11 min-w-0 w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export type AgentSignInProps = {
  userId: string;
  initialNodeId?: string;
  initialHarness?: LoginHarness;
  /** The original PAX conversation, never the native login attempt handle. */
  returnSessionId?: string;
};

export function AgentSignInSettings({
  userId,
  initialNodeId = "",
  initialHarness = "claude",
  returnSessionId,
}: AgentSignInProps) {
  const nodes = useNodes(userId);
  const [nodeId, setNodeId] = useState(initialNodeId);
  const [harness, setHarness] = useState(initialHarness);
  const devices = nodes.error
    ? []
    : (nodes.data?.nodes ?? []).filter(isDeviceNode);
  const selected = devices.find((node) => node.node_id === nodeId);
  const available = selected && isActiveNode(selected);
  const section = settingsSection("agentSignIn");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsPageHeader
        title={section.title}
        description={section.description}
        category={section.category}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-8 lg:py-7">
        <div className="mx-auto grid w-full max-w-3xl gap-4 sm:gap-6">
          <SettingsBack />
          {returnSessionId && (
            <div>
              <Button asChild size="sm">
                <Link
                  href={`/?${new URLSearchParams({ session_id: returnSessionId })}`}
                >
                  Return to session
                </Link>
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm text-ink-muted">
              Device
              <select
                className={fieldClass}
                aria-label="Device"
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
              >
                <option value="">Select a device</option>
                {nodeId && !selected && (
                  <option value={nodeId} disabled>
                    Linked device unavailable
                  </option>
                )}
                {devices.map((node) => (
                  <option key={node.node_id} value={node.node_id}>
                    {nodeLabel(node)}
                    {isActiveNode(node) ? "" : " (offline)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm text-ink-muted">
              Agent type
              <select
                className={fieldClass}
                aria-label="Agent type"
                value={harness}
                onChange={(event) =>
                  setHarness(event.target.value as LoginHarness)
                }
              >
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
              </select>
            </label>
          </div>
          {selected && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-tertiary">
              <span>Selected device</span>
              {selected.hostname && (
                <TruncatedText className="max-w-64">
                  {selected.hostname}
                </TruncatedText>
              )}
              <MonoId tooltip={selected.node_id}>
                {compactId(selected.node_id)}
              </MonoId>
            </div>
          )}
          <p className="text-sm leading-6 text-ink-tertiary">
            Credentials apply to the system account running PAX on this device.
            Other accounts or configurations may need a separate sign-in.
          </p>
          {nodes.isLoading ? (
            <p role="status" className="text-sm text-ink-tertiary">
              Loading devices…
            </p>
          ) : nodes.error ? (
            <div className="grid justify-items-start gap-3">
              <p role="alert" className="text-sm text-warning">
                Could not load your devices. Refresh before signing in.
              </p>
              <Button size="sm" onClick={() => void nodes.refetch()}>
                Refresh devices
              </Button>
            </div>
          ) : nodeId && !selected ? (
            <p role="alert" className="text-sm text-warning">
              This device is unavailable to your account. Select a device you
              own.
            </p>
          ) : selected && !available ? (
            <p role="status" className="text-sm text-ink-muted">
              This device is offline. Reconnect it before checking or changing
              its sign-in.
            </p>
          ) : available ? (
            <HarnessSignIn
              key={`${userId}:${nodeId}:${harness}`}
              userId={userId}
              nodeId={nodeId}
              harness={harness}
            />
          ) : (
            <p className="text-sm text-ink-tertiary">
              Choose a device to check its sign-in status.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const stateLabels: Record<string, string> = {
  logged_in: "Sign-in credentials found on this device.",
  succeeded: "Sign-in credentials found on this device.",
  logged_out: "Not signed in on this device.",
  starting: "Starting sign-in on the device…",
  awaiting_code:
    "Complete authorization in your browser, then paste the full authorization code below.",
  awaiting_browser:
    "Enter the device code in your browser. This page will update when sign-in completes.",
  exchanging: "Verifying sign-in on the device…",
  cancelled: "Sign-in was cancelled.",
  expired:
    "Sign-in expired. Start again to get a new authorization link or code.",
  failed:
    "Sign-in failed. Start again and use a new authorization link or code.",
};

function HarnessSignIn({
  userId,
  nodeId,
  harness,
}: {
  userId: string;
  nodeId: string;
  harness: LoginHarness;
}) {
  const flow = useAgentSignIn(userId, nodeId, harness);
  const [method, setMethod] = useState<HarnessLoginMethod>(
    harness === "claude" ? "subscription" : "device",
  );
  const [secret, setSecret] = useState("");
  const secretScope = `${flow.view?.session_id ?? ""}:${flow.view?.state ?? ""}:${flow.error}`;
  const [previousSecretScope, setPreviousSecretScope] = useState(secretScope);
  if (previousSecretScope !== secretScope) {
    setPreviousSecretScope(secretScope);
    setSecret("");
  }
  const pending = loginPending(flow.view);
  const signedIn =
    flow.view?.state === "logged_in" || flow.view?.state === "succeeded";
  const credentialsDetected = signedIn && !flow.error;
  const secretMethod = method === "api-key" || method === "access-token";
  const challenge = pending
    ? safeAuthorizationUrl(harness, flow.view?.authorization_url)
    : null;
  const unsupportedLink =
    pending && Boolean(flow.view?.authorization_url) && !challenge;
  const canSubmitCode =
    harness === "claude" && flow.view?.state === "awaiting_code" && challenge;
  const canStart =
    !pending &&
    !flow.busy &&
    !flow.checking &&
    Boolean(flow.view && stateLabels[flow.view.state]) &&
    !flow.error;
  const secretLabel = method === "api-key" ? "API key" : "Access token";
  const blocked = flow.busy || pending;

  return (
    <section
      aria-label={`${harness === "claude" ? "Claude Code" : "Codex"} sign-in`}
      className="grid gap-5 border-t border-hairline pt-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            role="status"
            aria-live="polite"
            className={
              credentialsDetected
                ? "flex items-start gap-2 text-sm font-medium leading-6 text-success"
                : "text-sm leading-6 text-ink"
            }
          >
            {credentialsDetected && (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
              />
            )}
            <span>
              {flow.error
                ? "Sign-in status could not be checked."
                : flow.view
                  ? (stateLabels[flow.view.state] ??
                    "The device returned an unknown sign-in state. Refresh status before continuing.")
                  : flow.checking
                    ? "Checking sign-in status…"
                    : "Sign-in status could not be checked."}
            </span>
          </p>
          {credentialsDetected && (
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Sign in again if a session reports expired credentials or an
              authentication error.
            </p>
          )}
          {flow.view?.auth_method && credentialsDetected && (
            <p className="mt-1 text-xs text-ink-tertiary">
              Credential method: {flow.view.auth_method}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="min-h-11"
          variant="ghost"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          disabled={flow.busy || flow.checking}
          onClick={flow.refresh}
        >
          Refresh status
        </Button>
      </div>
      {flow.error && (
        <p role="alert" className="text-sm leading-6 text-warning">
          {flow.error}
        </p>
      )}
      <label className="grid gap-2 text-sm text-ink-muted sm:max-w-sm">
        Sign-in method
        <select
          className={fieldClass}
          aria-label="Sign-in method"
          value={pending ? (flow.view?.method ?? method) : method}
          disabled={blocked}
          onChange={(event) => {
            setMethod(event.target.value as HarnessLoginMethod);
            setSecret("");
          }}
        >
          {harness === "claude" ? (
            <>
              <option value="subscription">Claude subscription</option>
              <option value="console">Anthropic Console</option>
            </>
          ) : (
            <>
              <option value="device">ChatGPT account (device code)</option>
              <option value="api-key">API key</option>
              <option value="access-token">Access token</option>
            </>
          )}
        </select>
      </label>
      {!pending && (
        <form
          className="grid justify-items-start gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canStart || (secretMethod && !validLoginSecret(secret)))
              return;
            const code = secretMethod ? secret : undefined;
            setSecret("");
            void flow.run({
              operation: "start",
              method,
              ...(code ? { code } : {}),
            });
          }}
        >
          {secretMethod && (
            <label className="grid w-full gap-2 text-sm text-ink-muted">
              {secretLabel}
              <input
                aria-label={secretLabel}
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={4096}
                className={fieldClass}
                value={secret}
                disabled={blocked}
                onChange={(event) => setSecret(event.target.value)}
              />
              <span className="text-xs leading-5 text-ink-tertiary">
                Enter one complete line without surrounding spaces. The
                credential is sent to the device only when you start sign-in and
                is then cleared from this form.
              </span>
            </label>
          )}
          <Button
            className="min-h-11"
            variant="primary"
            type="submit"
            disabled={!canStart || (secretMethod && !validLoginSecret(secret))}
          >
            {signedIn ? "Sign in again" : "Start sign-in"}
          </Button>
        </form>
      )}
      {unsupportedLink && (
        <p role="alert" className="text-sm leading-6 text-warning">
          The device returned an unsupported authorization link. Cancel this
          attempt and update paxd before trying again.
        </p>
      )}
      {challenge && (
        <div className="grid justify-items-start gap-3">
          <Button
            asChild
            className="min-h-11"
            icon={<ExternalLink className="h-4 w-4" />}
          >
            <a
              href={challenge}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Open {harness === "claude" ? "Claude" : "Codex"} authorization
            </a>
          </Button>
          {flow.view?.state === "awaiting_browser" && flow.view.user_code && (
            <div className="grid gap-1">
              <p className="text-xs text-ink-tertiary">Device code</p>
              <MonoId className="text-lg text-ink">
                {flow.view.user_code}
              </MonoId>
            </div>
          )}
        </div>
      )}
      {canSubmitCode && (
        <form
          className="grid justify-items-start gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              flow.busy ||
              !validLoginSecret(secret) ||
              !flow.view?.session_id
            )
              return;
            const code = secret;
            setSecret("");
            void flow.run({
              operation: "submit",
              session_id: flow.view.session_id,
              code,
            });
          }}
        >
          <label className="grid w-full gap-2 text-sm text-ink-muted">
            Full authorization code
            <input
              type="password"
              aria-label="Full authorization code"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={4096}
              className={fieldClass}
              value={secret}
              disabled={flow.busy}
              onChange={(event) => setSecret(event.target.value)}
            />
            <span className="text-xs leading-5 text-ink-tertiary">
              Paste the complete CLI authorization code, including its state
              suffix when present. Use the authorization result, not an email
              verification code.
            </span>
          </label>
          <Button
            type="submit"
            className="min-h-11"
            variant="primary"
            disabled={
              flow.busy || Boolean(flow.error) || !validLoginSecret(secret)
            }
          >
            Complete sign-in
          </Button>
        </form>
      )}
      {pending && flow.view?.session_id && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            className="min-h-11"
            disabled={flow.busy}
            onClick={() => {
              setSecret("");
              void flow.run({
                operation: "cancel",
                session_id: flow.view!.session_id,
              });
            }}
          >
            Cancel sign-in
          </Button>
          {flow.view.expires_at && (
            <p className="text-xs text-ink-tertiary">
              Expires {new Date(flow.view.expires_at).toLocaleTimeString()}.
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-5 text-ink-tertiary">
        Existing agent processes may need to be restarted to use the new
        credentials. Sign-in does not interrupt active conversations. After
        returning to your session, retry the request; restart its agent when it
        is idle if the error continues.
      </p>
    </section>
  );
}
