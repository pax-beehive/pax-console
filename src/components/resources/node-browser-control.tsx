"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { BrowserPreviewImage } from "./browser-preview-image";
import { usePreviewFocus } from "@/features/browser-control/use-preview-focus";
import { useBrowserState } from "@/features/browser-control/use-browser-state";
import { followBrowser } from "@/features/browser-control/follow-browser";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId } from "@/components/ui/text";
import {
  browserControl,
  BrowserFrame,
  BrowserOperation,
  BrowserTabs,
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

export function NodeBrowserViewer({
  nodeId,
  userId,
}: {
  nodeId: string;
  userId: string;
}) {
  return <BrowserPanel nodeId={nodeId} userId={userId} viewerOnly />;
}

function BrowserPanel({
  nodeId,
  userId,
  viewerOnly = false,
}: {
  nodeId: string;
  userId: string;
  viewerOnly?: boolean;
}) {
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [acting, setActing] = useState(false);
  const selectionVersion = useRef(0);
  const [origin, setOrigin] = useState("");
  const [selectedSession, setSession] = useState("");
  const [tabID, setTabID] = useState("");
  const [tabs, setTabs] = useState<BrowserTabs>();
  const [live, setLive] = useState(true);
  const [target, setTarget] = useState("");
  const [captured, setCaptured] = useState<{
    session: string;
    tabID: string;
    frame: BrowserFrame;
    at: number;
  }>();
  const [previewError, setPreviewError] = useState<Error>();
  const [grant, setGrant] = useState<{ secret_ref: string; expires: number }>();
  const query = useBrowserState(userId, nodeId);
  const state = query.data;
  const ownedControl = useRef<string | null>(null);
  const [ownsControl, setOwnsControl] = useState(false);
  function releaseOwnedControl() {
    const owner = ownedControl.current;
    if (!owner) return;
    ownedControl.current = null;
    setOwnsControl(false);
    void browserControl(userId, nodeId, "view", {
      session: owner,
      action: { type: "release" },
    })
      .then(() => query.refetch())
      .catch((e: Error) => setError(e));
  }
  usePreviewFocus(releaseOwnedControl);

  const previousFollowed = useRef("");
  const followed = followBrowser(state, previousFollowed.current);
  useEffect(() => {
    previousFollowed.current = followed;
  }, [followed]);
  const session = viewerOnly
    ? followed
    : selectedSession ||
      state?.operator ||
      (state?.workers.length === 1 ? state.workers[0].session : "");
  useEffect(() => {
    selectionVersion.current++;
  }, [session]);
  const frame =
    captured?.session === session && captured.tabID === tabID
      ? captured.frame
      : undefined;
  const connected = Boolean(
    state?.workers.some((worker) => worker.session === session),
  );
  const refreshLiveFrame = useEffectEvent(async () => {
    if (busyRef.current || !connected || state?.policy.paused) return false;
    return await view({ type: "screenshot" });
  });
  useEffect(() => {
    if (!live || !session) return;
    let stopped = false;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (stopped || refreshing) return;
      refreshing = true;
      let success = false;
      try {
        if (document.visibilityState !== "hidden")
          success = Boolean(await refreshLiveFrame());
      } finally {
        refreshing = false;
        if (!stopped) timer = setTimeout(refresh, success ? 2000 : 5000);
      }
    }
    function visibilityChanged() {
      if (document.visibilityState === "hidden") return;
      if (timer) clearTimeout(timer);
      void refresh();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    void refresh();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [live, session, tabID]);
  async function run(operation: BrowserOperation, payload: unknown) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActing(true);
    setError(undefined);
    try {
      if (
        operation === "view" &&
        (payload as { action?: { type?: string } }).action?.type === "takeover"
      ) {
        ownedControl.current = session;
        setOwnsControl(true);
      }
      await browserControl(userId, nodeId, operation, payload);
      await query.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setActing(false);
    }
  }
  async function view(action: Record<string, unknown>) {
    if (busyRef.current || !session) return false;
    if (
      action.type !== "screenshot" &&
      (state?.operator !== session || ownedControl.current !== session)
    )
      return false;
    busyRef.current = true;
    setBusy(true);
    setActing(action.type !== "screenshot");
    const version = selectionVersion.current;
    const oldFrame = frame;
    try {
      if (action.type === "screenshot" && !viewerOnly) {
        const inventory = await browserControl<BrowserTabs>(
          userId,
          nodeId,
          "view",
          { session, action: { type: "tabs" } },
        );
        if (version !== selectionVersion.current) return false;
        setTabs((previous) =>
          JSON.stringify(previous) === JSON.stringify(inventory)
            ? previous
            : inventory,
        );
        if (tabID && !inventory.tabs.some((tab) => tab.id === tabID)) {
          setTabID("");
          return false;
        }
      }
      if (action.type !== "screenshot")
        await browserControl(userId, nodeId, "view", {
          session,
          action: {
            ...action,
            tabID: tabID || undefined,
            frame: oldFrame?.frame,
          },
        });
      const next = await browserControl<BrowserFrame>(userId, nodeId, "view", {
        session,
        action: { type: "screenshot", tabID: tabID || undefined },
      });
      if (version !== selectionVersion.current) return false;
      setCaptured({ session, tabID, frame: next, at: Date.now() });
      setPreviewError(undefined);
      return true;
    } catch (e) {
      if (version !== selectionVersion.current) return false;
      setPreviewError(
        e instanceof Error ? e : new Error("Browser preview unavailable"),
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
      setActing(false);
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
        Watch the current page while the agent works. The image updates about
        every two seconds without taking control. Taking control pauses agent
        browser tools until you release control.
      </p>
      {!viewerOnly && (
        <>
          <Button
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh browser state
          </Button>
        </>
      )}
      {(error || query.error) && (
        <InlineError error={(error ?? query.error)!} />
      )}
      {!viewerOnly && <NodeBrowserVNC userId={userId} nodeId={nodeId} />}
      {state && (
        <>
          {viewerOnly && (
            <Link
              className="text-xs text-ink-muted underline"
              href={`/nodes/${encodeURIComponent(nodeId)}`}
            >
              Browser access and settings
            </Link>
          )}
          {!viewerOnly && (
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
                    <Button
                      disabled={busy}
                      onClick={() => void run("revoke", g)}
                    >
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
            </>
          )}
          <div className="grid gap-2">
            {!viewerOnly && (
              <>
                <h3>Watch browser</h3>
                <label className="grid gap-1 text-sm">
                  Connected browser
                  <select
                    className={inputClass}
                    value={session}
                    disabled={acting || Boolean(state.operator)}
                    onChange={(e) => {
                      selectionVersion.current++;
                      setSession(e.target.value);
                      setTabID("");
                      setTabs(undefined);
                      setLive(true);
                      setCaptured(undefined);
                      setPreviewError(undefined);
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
                {tabs && (
                  <label className="grid gap-1 text-sm">
                    Browser tab
                    <select
                      className={inputClass}
                      value={tabID}
                      disabled={acting}
                      onChange={(e) => {
                        selectionVersion.current++;
                        setTabID(e.target.value);
                        setCaptured(undefined);
                        setPreviewError(undefined);
                      }}
                    >
                      <option value="">Follow active agent tab</option>
                      {tabs.tabs.map((tab) => (
                        <option
                          key={tab.id}
                          value={tab.id}
                          disabled={tab.restricted}
                        >
                          {tab.title}
                          {tabs.activeTabID === tab.id ? " (agent)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {viewerOnly && (
              <p className="text-xs text-ink-muted">
                自动跟随最近操作的浏览器；接管期间保持当前画面。
              </p>
            )}
            {!state.workers.length && (
              <p className="text-xs text-ink-tertiary">
                Waiting for an agent browser connection. This list updates
                automatically.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!session}
                aria-pressed={live}
                onClick={() => setLive(!live)}
              >
                {live ? "Pause live view" : "Resume live view"}
              </Button>
              <Button
                disabled={busy || !session}
                onClick={() =>
                  void run("view", { session, action: { type: "takeover" } })
                }
              >
                Take control
              </Button>
              <Button
                disabled={busy || !state.operator}
                onClick={() => {
                  ownedControl.current = null;
                  setOwnsControl(false);
                  setCaptured(undefined);
                  setPreviewError(undefined);
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
                Human control is active. Control acquired here is released when
                you leave this page or close the panel.
              </p>
            )}
            <div role="status" className="text-xs text-ink-tertiary">
              {!session
                ? viewerOnly
                  ? "等待浏览器活动…"
                  : "Select a browser to watch."
                : !connected
                  ? "Waiting for the browser to reconnect..."
                  : state.policy.paused
                    ? "Browser access is paused."
                    : !live
                      ? "Live view paused."
                      : previewError
                        ? "Preview interrupted. Reconnecting automatically..."
                        : !frame
                          ? "Connecting to the browser..."
                          : busy
                            ? "Updating live image..."
                            : "Live view is updating automatically."}
              {frame && captured && (
                <span>
                  {" "}
                  Last image: {new Date(captured.at).toLocaleTimeString()}.
                </span>
              )}
            </div>
            {previewError && <InlineError error={previewError} />}
            {!viewerOnly && !frame && (
              <p className="text-xs text-ink-tertiary">
                Select the browser used by your agent to watch its current page.
                Take control is only needed to click or type.
              </p>
            )}
            {frame && (
              <button
                type="button"
                aria-label={
                  state.operator === session && ownsControl
                    ? "Browser image; click to interact"
                    : "Browser image; read-only preview"
                }
                className="relative block w-full overflow-hidden border border-hairline"
                disabled={
                  busy ||
                  state.operator !== session ||
                  !ownsControl ||
                  !frame.frame
                }
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  void view({
                    type: "click",
                    x: ((e.clientX - r.left) * frame.width) / r.width,
                    y: ((e.clientY - r.top) * frame.height) / r.height,
                  });
                }}
              >
                <BrowserPreviewImage
                  frame={frame}
                  onError={() => {
                    setPreviewError(
                      new Error(
                        "The browser image could not be displayed. Retrying automatically.",
                      ),
                    );
                    setCaptured(undefined);
                  }}
                />
              </button>
            )}
            {state.operator === session && ownsControl && (
              <div className="flex flex-wrap gap-2">
                {["Tab", "Enter", "Backspace", "Escape"].map((key) => (
                  <Button
                    key={key}
                    disabled={
                      busy ||
                      !frame?.frame ||
                      state.operator !== session ||
                      !ownsControl
                    }
                    onClick={() => void view({ type: "key", key })}
                  >
                    {key}
                  </Button>
                ))}
                <Button
                  disabled={
                    busy ||
                    !frame?.frame ||
                    state.operator !== session ||
                    !ownsControl
                  }
                  onClick={() => void view({ type: "scroll", x: 0, y: 600 })}
                >
                  Scroll down
                </Button>
                <Button
                  disabled={
                    busy ||
                    !frame?.frame ||
                    state.operator !== session ||
                    !ownsControl
                  }
                  onClick={() => void view({ type: "scroll", x: 0, y: -600 })}
                >
                  Scroll up
                </Button>
              </div>
            )}
          </div>
          {!viewerOnly && (
            <>
              <div className="grid gap-2">
                <h3>One-use browser password</h3>
                <p className="text-xs text-ink-tertiary">
                  Select the browser and site above, then the password field
                  from the agent page snapshot. The reference expires after one
                  minute. Release human control before asking the agent to fill
                  it.
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
                      onClick={() =>
                        void run("resume_sensitive", { session: s })
                      }
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
        </>
      )}
    </div>
  );
}
