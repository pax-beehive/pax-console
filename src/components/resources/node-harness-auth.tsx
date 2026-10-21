"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  authHarnesses,
  HarnessAuthError,
  commandHarnessAuth,
  getHarnessAuth,
  type AuthCommand,
  type AuthEvent,
  type AuthHarness,
} from "@/features/api/harness-auth";
import type { Node } from "@/features/api/types";

const changed = "harness-auth-attempt";
const terminal = (state?: string) =>
  Boolean(
    state &&
    [
      "succeeded",
      "failed",
      "expired",
      "cancelled",
      "configured",
      "unknown",
      "logged_in",
      "logged_out",
      "available",
    ].includes(state),
  );
type Handle = { harness: AuthHarness; command_id: string; session_id?: string };
function subscribe(fn: () => void) {
  window.addEventListener(changed, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(changed, fn);
    window.removeEventListener("storage", fn);
  };
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function parse(raw: string | null): Handle | undefined {
  try {
    const v = JSON.parse(raw ?? "null");
    if (
      authHarnesses.includes(v?.harness) &&
      typeof v?.command_id === "string" &&
      v.command_id.length <= 128 &&
      (!v.session_id ||
        (typeof v.session_id === "string" && v.session_id.length <= 128))
    )
      return {
        harness: v.harness,
        command_id: v.command_id,
        session_id: v.session_id,
      };
  } catch {
    /* Ignore invalid saved handles. */
  }
}
const methods: Partial<Record<AuthHarness, string[]>> = {
  claude: ["subscription", "console"],
  codex: ["device", "browser", "api-key", "access-token"],
  kimi: ["device"],
  gemini: ["device", "browser", "api-key", "vertex"],
  kiro: ["device", "browser"],
  hermes: ["oauth", "api-key"],
  openclaw: ["native", "api-key"],
  antigravity: ["interactive", "api-key", "adc"],
};
function safeURL(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function NativeNotice({ event }: { event: AuthEvent }) {
  const text = (event.message ?? "").replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"),
    "",
  );
  const links = event.url
    ? [event.url]
    : (text.match(/https?:\/\/[^\s<>"']+/g) ?? []);
  return (
    <div className="grid gap-1 break-words">
      <p className="whitespace-pre-wrap">{text}</p>
      {links.map((url, i) =>
        safeURL(url) ? (
          <a
            className="break-all underline"
            href={safeURL(url)}
            key={i}
            rel="noreferrer noopener"
            target="_blank"
          >
            Open authorization page
          </a>
        ) : null,
      )}
      {event.code && <code className="select-all">{event.code}</code>}
    </div>
  );
}
function Prompt({
  event,
  disabled,
  onSubmit,
}: {
  event: AuthEvent;
  disabled: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!value || sending) return;
    const input = value;
    setValue("");
    setSending(true);
    setError("");
    try {
      await onSubmit(input);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not confirm input. Check the current attempt before entering it again.",
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="grid gap-1">
        {event.message || "Authentication input"}
        {event.kind === "select" ? (
          <select
            aria-label="Authentication choice"
            className="rounded border border-hairline bg-surface-2 p-2"
            disabled={disabled || sending}
            onChange={(e) => setValue(e.target.value)}
            value={value}
          >
            <option value="">Choose an option</option>
            {event.options?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label ?? option.id}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="Authentication input"
            autoComplete="off"
            className="rounded border border-hairline bg-surface-2 p-2"
            disabled={disabled || sending}
            maxLength={4096}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            type="password"
            value={value}
          />
        )}
      </label>
      <Button disabled={disabled || sending || !value} type="submit">
        {sending ? "Submitting..." : "Continue"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function NodeHarnessAuth({
  node,
  userId,
}: {
  node: Node;
  userId: string;
}) {
  const [harness, setHarness] = useState<AuthHarness>("codex");
  const [method, setMethod] = useState("");
  const [provider, setProvider] = useState("");
  const [logout, setLogout] = useState(false);
  const [storageError, setStorageError] = useState("");
  const key = `harness-auth-v1:${userId}:${node.node_id}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const pending = parse(raw);
  const selected = pending?.harness ?? harness;
  const client = useQueryClient();
  const queryKey = [
    "harness-auth",
    userId,
    node.node_id,
    pending?.command_id ?? "none",
  ];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      getHarnessAuth(userId, node.node_id, {
        harness: pending!.harness,
        ...(pending!.session_id
          ? { session_id: pending!.session_id }
          : { command_id: pending!.command_id }),
      }),
    enabled: Boolean(node.online && pending),
    gcTime: 0,
    retry: false,
    refetchInterval: (q) => (terminal(q.state.data?.state) ? false : 1500),
    meta: { sensitive: true },
  });
  const status = useQuery({
    queryKey: ["harness-auth-status", userId, node.node_id, harness, provider],
    queryFn: () =>
      getHarnessAuth(userId, node.node_id, {
        harness,
        ...(provider ? { provider } : {}),
      }),
    enabled: false,
    gcTime: 0,
    retry: false,
    meta: { sensitive: true },
  });
  function save(handle: Handle) {
    localStorage.setItem(key, JSON.stringify(handle));
    window.dispatchEvent(new Event(changed));
  }
  const start = useMutation({
    mutationFn: (request: AuthCommand) =>
      commandHarnessAuth(userId, node.node_id, request),
    gcTime: 0,
    onSuccess: (attempt, request) => {
      save({
        harness: request.harness,
        command_id: request.command_id,
        session_id: attempt.session_id,
      });
      client.setQueryData(
        ["harness-auth", userId, node.node_id, request.command_id],
        attempt,
      );
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      commandHarnessAuth(userId, node.node_id, {
        command_id: crypto.randomUUID(),
        harness: selected,
        operation: "cancel",
        session_id: query.data!.session_id,
      }),
    gcTime: 0,
    onSuccess: (attempt) => client.setQueryData(queryKey, attempt),
  });
  const effectiveMethod = method || (methods[harness]?.[0] ?? "");
  const needsTerminal =
    harness === "opencode" ||
    (harness === "openclaw" && effectiveMethod !== "api-key") ||
    (harness === "antigravity" && effectiveMethod === "interactive");
  const active = Boolean(pending && !terminal(query.data?.state));
  const blocked = !node.online || start.isPending || Boolean(pending);
  const needsProvider = harness === "hermes" || harness === "openclaw";
  function begin(action: "login" | "logout") {
    if (blocked || (needsProvider && !provider.trim())) return;
    const request: AuthCommand = {
      command_id: crypto.randomUUID(),
      harness,
      operation: "start",
      action,
      ...(provider.trim() ? { provider: provider.trim() } : {}),
      ...(action === "login" && effectiveMethod && effectiveMethod !== "native"
        ? { method: effectiveMethod }
        : {}),
      ...(action === "login" &&
      ["api-key", "access-token"].includes(effectiveMethod) &&
      harness !== "antigravity" &&
      harness !== "hermes"
        ? { secret_stdin: true }
        : {}),
    };
    try {
      save({ harness, command_id: request.command_id });
      setStorageError("");
    } catch {
      setStorageError(
        "Could not save the attempt handle for recovery. Enable browser storage and retry.",
      );
      return;
    }
    setLogout(false);
    start.mutate(request);
  }
  async function answer(value: string) {
    try {
      const attempt = await commandHarnessAuth(userId, node.node_id, {
        command_id: crypto.randomUUID(),
        harness: selected,
        operation: "submit",
        session_id: query.data!.session_id,
        prompt_id: query.data!.prompt!.id,
        code: value,
      });
      client.setQueryData(queryKey, attempt);
    } finally {
      void query.refetch();
    }
  }
  function forget() {
    localStorage.removeItem(key);
    window.dispatchEvent(new Event(changed));
    client.removeQueries({ queryKey });
    start.reset();
    cancel.reset();
  }
  const error =
    storageError ||
    start.error?.message ||
    cancel.error?.message ||
    query.error?.message;
  const attempt = query.data;
  return (
    <section aria-label="Harness authentication" className="grid gap-3 text-sm">
      <h2 className="font-medium">Harness sign-in</h2>
      <p className="text-ink-muted">
        Sign in on this node using the official tool. Credentials apply to the
        node’s default environment. Closing this page does not cancel an active
        sign-in; return here to continue.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          Harness
          <select
            aria-label="Authentication harness"
            className="rounded border border-hairline bg-surface-2 p-2"
            disabled={blocked}
            onChange={(e) => {
              setHarness(e.target.value as AuthHarness);
              setMethod("");
              setProvider("");
            }}
            value={selected}
          >
            {authHarnesses.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        {!pending && methods[harness] && (
          <label className="grid gap-1">
            Login method
            <select
              aria-label="Login method"
              className="rounded border border-hairline bg-surface-2 p-2"
              disabled={blocked}
              onChange={(e) => setMethod(e.target.value)}
              value={effectiveMethod}
            >
              {methods[harness]?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        {!pending && needsProvider && (
          <label className="grid gap-1">
            Provider
            <input
              aria-label="Authentication provider"
              className="rounded border border-hairline bg-surface-2 p-2"
              disabled={blocked}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={
                harness === "hermes" ? "e.g. openai-codex" : "e.g. openai"
              }
              value={provider}
            />
          </label>
        )}
      </div>
      {!pending && needsTerminal && (
        <p>
          This native flow needs a terminal. Run{" "}
          <code>paxl auth login --harness {harness}</code> on the node.
        </p>
      )}
      {harness === "antigravity" && effectiveMethod !== "interactive" && (
        <p>
          Uses credentials already set in the node&apos;s GEMINI_API_KEY or
          AGY_ADC_AUTH environment. It does not save a new key.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            blocked || needsTerminal || (needsProvider && !provider.trim())
          }
          onClick={() => begin("login")}
        >
          Sign in
        </Button>
        <Button
          disabled={
            blocked ||
            harness === "opencode" ||
            harness === "antigravity" ||
            harness === "openclaw" ||
            (needsProvider && !provider.trim())
          }
          onClick={() => setLogout(true)}
          variant="secondary"
        >
          Sign out
        </Button>
        <Button
          disabled={
            !node.online ||
            active ||
            status.isFetching ||
            (needsProvider && !provider.trim())
          }
          onClick={() => void status.refetch()}
          variant="secondary"
        >
          Check sign-in
        </Button>
      </div>
      {status.data && (
        <p>
          Native status: {status.data.state}. {status.data.result?.message}
        </p>
      )}
      {status.error && <p role="alert">{status.error.message}</p>}
      {pending && (
        <div aria-live="polite" className="grid gap-3">
          <p>
            Authentication state: {attempt?.state ?? "Recovering attempt..."}
          </p>
          {attempt?.events?.map((event, i) => (
            <NativeNotice event={event} key={i} />
          ))}
          {attempt?.prompt && (
            <Prompt
              disabled={!node.online}
              event={attempt.prompt}
              key={`${attempt.session_id}:${attempt.prompt.id}`}
              onSubmit={answer}
            />
          )}
          <p>{attempt?.result?.message ?? attempt?.error_code}</p>
          <div className="flex flex-wrap gap-2">
            {active && attempt?.session_id && (
              <Button
                disabled={!node.online || cancel.isPending}
                onClick={() => cancel.mutate()}
                variant="secondary"
              >
                Cancel sign-in
              </Button>
            )}
            <Button
              disabled={!node.online || query.isFetching}
              onClick={() => void query.refetch()}
              variant="secondary"
            >
              Refresh attempt
            </Button>
            {(terminal(attempt?.state) ||
              (query.error instanceof HarnessAuthError &&
                query.error.code === "not_found")) && (
              <Button onClick={forget} variant="secondary">
                Start again
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <ConfirmDialog
        confirmLabel="Sign out"
        description={
          harness === "kimi"
            ? "Remove the native Kimi Code account grant? This also disconnects this node's Kimi Remote Control session. API-key providers may remain."
            : "Remove the selected native account credentials? Environment credentials and other profiles may remain."
        }
        onConfirm={() => begin("logout")}
        onOpenChange={setLogout}
        open={logout}
        title="Sign out of harness"
      />
    </section>
  );
}
