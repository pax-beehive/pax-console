"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNodeAgents, useNodes } from "@/features/api/resources";
import type {
  HarnessAuthAccount,
  HarnessLoginMethod,
  LoginHarness,
} from "@/features/api/types";
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
import { HarnessUsagePanel } from "./agent-usage";
import { agentTypeLabel, registeredAgentTypes } from "./agent-types";

const fieldClass =
  "min-h-11 min-w-0 w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export type AgentSignInProps = {
  userId: string;
  initialNodeId?: string;
  /** Preferred agent type; the first registered type is used when absent. */
  initialHarness?: LoginHarness;
  /** The original PAX conversation, never the native login attempt handle. */
  returnSessionId?: string;
};

export function AgentSignInSettings({
  userId,
  initialNodeId = "",
  initialHarness,
  returnSessionId,
}: AgentSignInProps) {
  const nodes = useNodes(userId);
  const [nodeId, setNodeId] = useState(initialNodeId);
  const [preferredHarness, setHarness] = useState(initialHarness);
  const devices = nodes.error
    ? []
    : (nodes.data?.nodes ?? []).filter(isDeviceNode);
  const selected = devices.find((node) => node.node_id === nodeId);
  const available = selected && isActiveNode(selected);
  // Agent types come from agents registered in PAX for this device only.
  const agents = useNodeAgents(userId, selected ? nodeId : undefined);
  const agentTypes = agents.data
    ? registeredAgentTypes(agents.data.agents ?? [], nodeId)
    : [];
  const harness =
    preferredHarness && agentTypes.includes(preferredHarness)
      ? preferredHarness
      : agentTypes[0];
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
                value={harness ?? ""}
                disabled={agentTypes.length === 0}
                onChange={(event) => setHarness(event.target.value)}
              >
                {agentTypes.length === 0 && (
                  <option value="">
                    {selected && agents.isLoading
                      ? "Loading agents…"
                      : "No registered agents"}
                  </option>
                )}
                {agentTypes.map((type) => (
                  <option key={type} value={type}>
                    {agentTypeLabel(type)}
                  </option>
                ))}
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
          ) : available && agents.isLoading ? (
            <p role="status" className="text-sm text-ink-tertiary">
              Loading agents…
            </p>
          ) : available && agents.error ? (
            <div className="grid justify-items-start gap-3">
              <p role="alert" className="text-sm text-warning">
                Could not load the agents registered on this device.
              </p>
              <Button size="sm" onClick={() => void agents.refetch()}>
                Refresh agents
              </Button>
            </div>
          ) : available && !harness ? (
            <p role="status" className="text-sm text-ink-muted">
              No agents are registered on this device. Add an agent to it in PAX
              before signing in.
            </p>
          ) : available && harness ? (
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
  logged_in: "Signed in",
  succeeded: "Signed in",
  logged_out: "Not signed in on this device.",
  starting: "Starting sign-in on the device…",
  awaiting_code:
    "Approve access in your browser, then paste the full authorization code below.",
  awaiting_browser:
    "Approve access in your browser. This page updates when sign-in completes.",
  exchanging: "Verifying sign-in on the device…",
  cancelled: "Sign-in was cancelled.",
  expired: "Sign-in expired. Start again to get a new link or code.",
  failed: "Sign-in failed. Start again to get a new link or code.",
};

type MethodOption = {
  value: HarnessLoginMethod;
  label: string;
  hint: string;
};

/** Native sign-in methods, named by the account the user signs in with. */
const methodOptions: Record<string, MethodOption[]> = {
  "claude-code": [
    {
      value: "subscription",
      label: "Claude account (Pro / Max)",
      hint: "Opens claude.ai to approve this device.",
    },
    {
      value: "console",
      label: "Anthropic Console (API billing)",
      hint: "Uses your Console organization's API credits.",
    },
  ],
  codex: [
    {
      value: "device",
      label: "ChatGPT account",
      hint: "Opens a ChatGPT page. Enter the code shown here to approve this device.",
    },
    {
      value: "api-key",
      label: "OpenAI API key",
      hint: "Paste a key from platform.openai.com.",
    },
    {
      value: "access-token",
      label: "Access token",
      hint: "For tokens issued by your organization.",
    },
  ],
};

/**
 * The sign-in method that produced the current credential, from the native
 * auth_method (`claude auth status`: claude.ai or api_key for a Console login;
 * Codex: chatgpt, api_key, or access_token).
 */
export function defaultSignInMethod(
  harness: LoginHarness,
  authMethod?: string,
): HarnessLoginMethod {
  const byCredential: Record<string, HarnessLoginMethod> =
    harness === "claude-code"
      ? { "claude.ai": "subscription", api_key: "console" }
      : { chatgpt: "device", api_key: "api-key", access_token: "access-token" };
  return (
    (authMethod ? byCredential[authMethod] : undefined) ??
    methodOptions[harness]?.[0]?.value ??
    "subscription"
  );
}

const credentialLabels: Record<string, string> = {
  "claude.ai": "Claude account",
  api_key: "API key",
  chatgpt: "ChatGPT",
  access_token: "Access token",
};

const providerNames: Record<string, string> = {
  "claude-code": "Claude",
  codex: "ChatGPT",
};

const cardClass =
  "grid min-w-0 gap-4 rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5";

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
  // Bumped by Refresh so the usage card re-reads together with sign-in status.
  const [usageRefresh, setUsageRefresh] = useState(0);
  const label = agentTypeLabel(harness);
  const provider = providerNames[harness] ?? label;
  const claude = harness === "claude-code";
  const options = methodOptions[harness] ?? [];
  const [chosenMethod, setChosenMethod] = useState<HarnessLoginMethod>();
  const method =
    chosenMethod ?? defaultSignInMethod(harness, flow.view?.auth_method);
  const option = options.find((candidate) => candidate.value === method);
  // Signed-in devices keep sign-in controls collapsed until asked for.
  const [expanded, setExpanded] = useState(false);
  const [choosing, setChoosing] = useState(false);
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
  const credentialsDetected = signedIn && !flow.error && !flow.busy;
  // Agent types without native sign-in support on the device.
  const unsupported = flow.view?.state === "unsupported" && !flow.error;
  const secretMethod = method === "api-key" || method === "access-token";
  const challenge = pending
    ? safeAuthorizationUrl(harness, flow.view?.authorization_url)
    : null;
  const unsupportedLink =
    pending && Boolean(flow.view?.authorization_url) && !challenge;
  const canSubmitCode =
    claude && flow.view?.state === "awaiting_code" && challenge;
  const canStart =
    !pending &&
    !flow.busy &&
    !flow.checking &&
    Boolean(flow.view && stateLabels[flow.view.state]) &&
    !flow.error;
  const secretLabel = method === "api-key" ? "API key" : "Access token";
  const blocked = flow.busy || pending;
  const showForm =
    !unsupported && !pending && (!credentialsDetected || expanded);
  const actionLabel = credentialsDetected ? "Re-authenticate" : "Sign in";

  const start = () => {
    if (!canStart || (secretMethod && !validLoginSecret(secret))) return;
    const code = secretMethod ? secret : undefined;
    setSecret("");
    void flow.run({ operation: "start", method, ...(code ? { code } : {}) });
  };
  const refresh = () => {
    void flow.refresh();
    setUsageRefresh((count) => count + 1);
  };

  return (
    <section aria-label={`${label} sign-in`} className="grid gap-4">
      <div className={cardClass}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            className="flex min-w-0 items-start gap-2 text-sm leading-6 text-ink"
          >
            {credentialsDetected && (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-success"
              />
            )}
            {credentialsDetected ? (
              <span>
                <span className="font-medium">{label}</span>
                <span className="text-ink-muted"> · Signed in</span>
              </span>
            ) : (
              <span>
                {flow.error
                  ? "Sign-in status could not be checked."
                  : unsupported
                    ? `Sign-in is not available for ${label} yet.`
                    : flow.view
                      ? (stateLabels[flow.view.state] ??
                        "The device returned an unknown sign-in state. Refresh before continuing.")
                      : flow.checking
                        ? "Checking sign-in status…"
                        : "Sign-in status could not be checked."}
              </span>
            )}
          </p>
          <Button
            size="sm"
            className="-my-1.5 min-h-11 shrink-0"
            variant="ghost"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            disabled={flow.busy || flow.checking}
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>
        {credentialsDetected && (
          <AccountDetails
            account={flow.view?.account}
            authMethod={flow.view?.auth_method ?? flow.view?.method}
          />
        )}
        {flow.error && (
          <p role="alert" className="text-sm leading-6 text-warning">
            {flow.error}
          </p>
        )}
        {credentialsDetected && !expanded && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-3">
            <span className="text-xs text-ink-tertiary">
              Credentials expired?
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  setChoosing(true);
                  setExpanded(true);
                }}
              >
                Use a different method
              </Button>
              <Button
                size="sm"
                className="min-h-11"
                disabled={!canStart}
                onClick={() => (secretMethod ? setExpanded(true) : start())}
              >
                Re-authenticate
              </Button>
            </div>
          </div>
        )}
        {showForm && (
          <form
            className={cn(
              "grid justify-items-start gap-4",
              credentialsDetected && "border-t border-hairline pt-4",
            )}
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            {!credentialsDetected || choosing ? (
              <label className="grid w-full gap-2 text-sm text-ink-muted sm:max-w-sm">
                Sign in with
                <select
                  className={fieldClass}
                  aria-label="Sign-in method"
                  value={method}
                  disabled={blocked}
                  onChange={(event) => {
                    setChosenMethod(event.target.value as HarnessLoginMethod);
                    setSecret("");
                  }}
                >
                  {options.map((candidate) => (
                    <option key={candidate.value} value={candidate.value}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-ink">{option?.label}</p>
            )}
            {option && (
              <p className="-mt-2 text-xs leading-5 text-ink-tertiary">
                {option.hint}
              </p>
            )}
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
                  Enter one complete line without surrounding spaces. It is sent
                  to the device only when you start and is then cleared from
                  this form.
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-h-11"
                variant="primary"
                type="submit"
                disabled={
                  !canStart || (secretMethod && !validLoginSecret(secret))
                }
              >
                {actionLabel}
              </Button>
              {credentialsDetected && (
                <Button
                  className="min-h-11"
                  variant="ghost"
                  onClick={() => {
                    setExpanded(false);
                    setChoosing(false);
                    setChosenMethod(undefined);
                    setSecret("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
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
                Open {provider} sign-in
              </a>
            </Button>
            {flow.view?.state === "awaiting_browser" && flow.view.user_code && (
              <div className="grid gap-1">
                <p className="text-xs text-ink-tertiary">
                  Enter this code on the {provider} page
                </p>
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
                Paste the complete code shown after you approve access,
                including its state suffix when present. Use the authorization
                result, not an email verification code.
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
        {(pending || expanded || flow.view?.state === "succeeded") && (
          <p className="text-xs leading-5 text-ink-tertiary">
            Running agents may need a restart to use new credentials. Sign-in
            does not interrupt active conversations; retry the request in your
            session, and restart its agent when idle if the error continues.
          </p>
        )}
      </div>
      {(credentialsDetected || unsupported) && (
        <HarnessUsagePanel
          userId={userId}
          nodeId={nodeId}
          harness={harness}
          className={cardClass}
          hideWhenUnsupported={unsupported}
          refreshKey={usageRefresh}
        />
      )}
    </section>
  );
}

function AccountDetails({
  account,
  authMethod,
}: {
  account?: HarnessAuthAccount;
  authMethod?: string;
}) {
  const email = account?.email?.trim();
  const displayName = account?.display_name?.trim();
  const identity = email || displayName;
  const badges = [
    account?.plan?.trim(),
    authMethod ? (credentialLabels[authMethod] ?? authMethod) : undefined,
  ].filter((value): value is string => Boolean(value));
  const extra = [
    email && displayName !== email ? displayName : undefined,
    account?.organization?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const method = authMethod?.replaceAll(/[-_]/g, "").toLowerCase();
  const secretMethod = method === "apikey" || method === "accesstoken";

  return (
    <div
      className="grid min-w-0 gap-1"
      aria-label={identity ? "Signed-in account" : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm leading-6">
        {identity ? (
          <TruncatedText className="font-medium text-ink">
            {identity}
          </TruncatedText>
        ) : (
          <span className="text-ink-muted">
            {secretMethod
              ? "This sign-in method does not report account details."
              : "Account details are unavailable on this device."}
          </span>
        )}
        {badges.map((badge) => (
          <Badge key={badge}>{badge}</Badge>
        ))}
      </div>
      {extra && (
        <TruncatedText className="text-xs leading-5 text-ink-tertiary">
          {extra}
        </TruncatedText>
      )}
    </div>
  );
}
