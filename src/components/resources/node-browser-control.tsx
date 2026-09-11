"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId } from "@/components/ui/text";
import {
  browserControl,
  BrowserFrame,
  BrowserOperation,
  BrowserState,
} from "@/features/browser-control/api";
import { NodeBrowserVNC } from "./node-browser-vnc";
import { NodeSecretChannelPush } from "./node-secret-channel-push";

export function NodeBrowserControl({
  nodeId,
  userId,
}: {
  nodeId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="grid min-w-0 gap-3 border-t border-hairline pt-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Browser</h2>
        <Button onClick={() => setOpen(!open)}>
          {open ? "Close panel" : "Open browser control"}
        </Button>
      </div>
      {open && (
        <BrowserPanel
          key={`${userId}/${nodeId}`}
          nodeId={nodeId}
          userId={userId}
        />
      )}
    </section>
  );
}

function BrowserPanel({ nodeId, userId }: { nodeId: string; userId: string }) {
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [origin, setOrigin] = useState("");
  const [session, setSession] = useState("");
  const [target, setTarget] = useState("");
  const [frame, setFrame] = useState<BrowserFrame>();
  const [grant, setGrant] = useState<{ secret_ref: string; expires: number }>();
  const query = useQuery({
    queryKey: ["user", userId, "node", nodeId, "browser-control"],
    queryFn: () => browserControl<BrowserState>(userId, nodeId, "state"),
    retry: false,
    refetchInterval: false,
    gcTime: 0,
  });
  const state = query.data;
  async function run(operation: BrowserOperation, payload: unknown) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await browserControl(userId, nodeId, operation, payload);
      await query.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function view(action: Record<string, unknown>) {
    if (busyRef.current || !session) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    const oldFrame = frame;
    setFrame(undefined);
    try {
      if (action.type !== "screenshot")
        await browserControl(userId, nodeId, "view", {
          session,
          action: { ...action, frame: oldFrame?.frame },
        });
      setFrame(
        await browserControl<BrowserFrame>(userId, nodeId, "view", {
          session,
          action: { type: "screenshot" },
        }),
      );
      await query.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function register(fileRef: string) {
    setError(undefined);
    setGrant(undefined);
    try {
      setGrant(
        await browserControl(userId, nodeId, "secret", {
          fileRef,
          session,
          origin,
          target,
          ttlMs: 60_000,
        }),
      );
    } catch (e) {
      setError(e as Error);
    }
  }
  const inputClass =
    "min-w-0 rounded border border-hairline bg-surface-1 px-2 py-2 text-base sm:text-sm";
  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-xs text-ink-tertiary">
        Manage this node browser access and inspect connected Chrome sessions.
        Refresh to load new approval requests. Taking control pauses agent
        browser tools until you release control.
      </p>
      <Button
        disabled={busy || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh browser state
      </Button>
      {(error || query.error) && (
        <InlineError error={(error ?? query.error)!} />
      )}
      <NodeBrowserVNC userId={userId} nodeId={nodeId} />
      {state && (
        <>
          <div className="flex flex-wrap gap-2">
            <span>
              {state.policy.paused
                ? "All browser control paused"
                : "Allowlist active"}
            </span>
            <Button
              disabled={busy}
              onClick={() =>
                void run("policy", {
                  ...state.policy,
                  revision: state.policy.revision ?? 0,
                  paused: !state.policy.paused,
                })
              }
            >
              {state.policy.paused ? "Resume" : "Pause all"}
            </Button>
          </div>
          <div className="grid gap-2">
            <h3>Site approvals</h3>
            {state.pending
              .filter((p) => p.decision === "pending")
              .map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 border-b border-hairline py-2"
                >
                  <span className="break-all">{p.origin}</span>
                  <MonoId>{p.session}</MonoId>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("decide", {
                        id: p.id,
                        decision: "allow",
                        scope: "session",
                      })
                    }
                  >
                    Allow session
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("decide", {
                        id: p.id,
                        decision: "allow",
                        scope: "global",
                      })
                    }
                  >
                    Always allow
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("decide", {
                        id: p.id,
                        decision: "deny",
                        scope: "session",
                      })
                    }
                  >
                    Deny
                  </Button>
                </div>
              ))}
            {state.policy.origins.map((o) => (
              <div key={o} className="flex flex-wrap items-center gap-2">
                <span className="break-all">{o}</span>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run("policy", {
                      ...state.policy,
                      revision: state.policy.revision ?? 0,
                      origins: state.policy.origins.filter((x) => x !== o),
                    })
                  }
                >
                  Revoke
                </Button>
              </div>
            ))}
            {state.grants.map((g) => (
              <div
                key={`${g.session}/${g.origin}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span>{g.origin}</span>
                <MonoId>{g.session}</MonoId>
                <Button disabled={busy} onClick={() => void run("revoke", g)}>
                  Revoke session grant
                </Button>
              </div>
            ))}
            <label className="grid gap-1 text-sm">
              Site origin
              <input
                className={inputClass}
                value={origin}
                placeholder="https://example.com"
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setGrant(undefined);
                }}
              />
            </label>
            <Button
              disabled={busy || !origin}
              onClick={() =>
                void run("policy", {
                  ...state.policy,
                  revision: state.policy.revision ?? 0,
                  origins: [...state.policy.origins, origin],
                })
              }
            >
              Add allowed site
            </Button>
          </div>
          <div className="grid gap-2">
            <h3>Chrome remote view</h3>
            <label className="grid gap-1 text-sm">
              Connected browser
              <select
                className={inputClass}
                value={session}
                disabled={busy || Boolean(state.operator)}
                onChange={(e) => {
                  setSession(e.target.value);
                  setFrame(undefined);
                  setGrant(undefined);
                }}
              >
                <option value="">Select a browser session</option>
                {state.workers.map((w) => (
                  <option key={w.session} value={w.session}>
                    {w.session}
                  </option>
                ))}
              </select>
            </label>
            {!state.workers.length && (
              <p className="text-xs text-ink-tertiary">
                No connected worker. Start a browser action in the agent
                session, then refresh.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !session}
                onClick={() =>
                  void run("view", { session, action: { type: "takeover" } })
                }
              >
                Take control
              </Button>
              <Button
                disabled={busy || state.operator !== session}
                onClick={() => void view({ type: "screenshot" })}
              >
                Refresh image
              </Button>
              <Button
                disabled={busy || !state.operator}
                onClick={() => {
                  setFrame(undefined);
                  void run("view", {
                    session: state.operator,
                    action: { type: "release" },
                  });
                }}
              >
                Release control
              </Button>
            </div>
            {state.operator && (
              <p className="text-xs text-ink-tertiary">
                Human control is active. Closing this panel leaves the agent
                paused.
              </p>
            )}
            {frame && (
              <button
                type="button"
                aria-label="Browser image; click to interact"
                className="block w-full cursor-crosshair overflow-hidden border border-hairline"
                disabled={busy}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  void view({
                    type: "click",
                    x: ((e.clientX - r.left) * frame.width) / r.width,
                    y: ((e.clientY - r.top) * frame.height) / r.height,
                  });
                }}
              >
                {/* Live pixels are transient and must not pass through the image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Current browser page"
                  src={`data:image/jpeg;base64,${frame.image}`}
                  className="block h-auto w-full"
                  draggable={false}
                />
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {["Tab", "Enter", "Backspace", "Escape"].map((key) => (
                <Button
                  key={key}
                  disabled={busy || !frame}
                  onClick={() => void view({ type: "key", key })}
                >
                  {key}
                </Button>
              ))}
              <Button
                disabled={busy || !frame}
                onClick={() => void view({ type: "scroll", x: 0, y: 600 })}
              >
                Scroll down
              </Button>
              <Button
                disabled={busy || !frame}
                onClick={() => void view({ type: "scroll", x: 0, y: -600 })}
              >
                Scroll up
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <h3>One-use browser password</h3>
            <p className="text-xs text-ink-tertiary">
              Select the browser and site above, then the password field from
              the agent page snapshot. The reference expires after one minute.
              Release human control before asking the agent to fill it.
            </p>
            <label className="grid gap-1 text-sm">
              Password field
              <input
                className={inputClass}
                value={target}
                placeholder="e12 or #password"
                onChange={(e) => {
                  setTarget(e.target.value);
                  setGrant(undefined);
                }}
              />
            </label>
            {session && origin && target && (
              <NodeSecretChannelPush
                key={`${session}/${origin}/${target}`}
                nodeId={nodeId}
                userId={userId}
                onDelivered={(receipt) => void register(receipt.fileRef)}
              />
            )}
            {grant && (
              <div className="text-xs">
                <p>
                  Give this one-use instruction to the agent before{" "}
                  {new Date(grant.expires).toLocaleTimeString()}:
                </p>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      tool: "browser_fill_secret",
                      arguments: {
                        secret_ref: grant.secret_ref,
                        origin,
                        target,
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
            {state.sensitiveSessions.map((s) => (
              <div key={s} className="flex flex-wrap items-center gap-2">
                <MonoId>{s}</MonoId>
                <span className="text-xs">Password observation hold</span>
                <Button
                  disabled={busy}
                  onClick={() => void run("resume_sensitive", { session: s })}
                >
                  Page is safe; resume agent
                </Button>
              </div>
            ))}
          </div>
          <details>
            <summary>Browser audit</summary>
            <div className="max-h-64 overflow-auto text-xs">
              {state.audit.map((a, i) => (
                <p key={i}>
                  {a.at} {a.event} {a.origin} {a.outcome}
                </p>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
