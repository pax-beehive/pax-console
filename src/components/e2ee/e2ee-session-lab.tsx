"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, LockKeyhole, Plus, Radio, Send } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  createAgentSession,
  useAgentSessions,
  useAgents,
} from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { loadRootKey } from "@/features/e2ee/root-key-store";
import {
  buildE2EEPromptFrame,
  buildE2EESessionNewFrame,
  extractE2EEFrameText,
  parseE2EERPCResponse,
} from "@/features/e2ee/session-lab";
import {
  observeEncryptedEvents,
  sendEncryptedCommand,
} from "@/features/e2ee/transport";
import { compactId } from "@/lib/format";

type ReceivedFrame = {
  id: number;
  receivedAt: string;
  value: unknown;
};

type StreamStatus = "idle" | "locked" | "listening" | "error";

type RootKeyState = {
  agentId: string;
  error?: string;
  key?: Uint8Array;
};

type PendingLifecycle = {
  sessionId: string;
};

export function E2EESessionLabRoute() {
  return <AuthGate>{(user) => <E2EESessionLab user={user} />}</AuthGate>;
}

function E2EESessionLab({ user }: { user: User }) {
  const searchParams = useSearchParams();
  const requestedAgentId = searchParams.get("agentId") ?? "";
  const agentsQuery = useAgents(user.user_id, "owned");
  const agents = agentsQuery.data?.agents ?? [];
  const [agentId, setAgentId] = useState(requestedAgentId);
  const activeAgentId = agents.some((agent) => agent.agent_id === agentId)
    ? agentId
    : agents.some((agent) => agent.agent_id === requestedAgentId)
      ? requestedAgentId
      : (agents[0]?.agent_id ?? "");
  const activeAgent = agents.find((agent) => agent.agent_id === activeAgentId);
  const sessionsQuery = useAgentSessions(
    user.user_id,
    activeAgent?.node_id,
    activeAgentId,
  );
  const sessions = sessionsQuery.data?.sessions ?? [];
  const [sessionId, setSessionId] = useState("");
  const activeSessionId = sessions.some(
    (session) => session.session_id === sessionId,
  )
    ? sessionId
    : (sessions[0]?.session_id ?? "");
  const activeSession = sessions.find(
    (session) => session.session_id === activeSessionId,
  );
  const [rootKeyState, setRootKeyState] = useState<RootKeyState>({
    agentId: "",
  });
  const [keyEpoch, setKeyEpoch] = useState(1);
  const [streamError, setStreamError] = useState("");
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const [frames, setFrames] = useState<ReceivedFrame[]>([]);
  const nextFrameId = useRef(1);
  const [liveText, setLiveText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [commandStatus, setCommandStatus] = useState("");
  const [sessionName, setSessionName] = useState("Encrypted session");
  const [cwd, setCwd] = useState("/tmp");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const pendingLifecycle = useRef(new Map<string, PendingLifecycle>());

  useEffect(() => {
    let active = true;
    if (!activeAgentId) {
      return;
    }
    void loadRootKey(activeAgentId)
      .then((key) => {
        if (active) {
          setRootKeyState({ agentId: activeAgentId, key });
        }
      })
      .catch((error) => {
        if (active) {
          setRootKeyState({
            agentId: activeAgentId,
            error: errorMessage(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [activeAgentId]);

  const rootKey =
    rootKeyState.agentId === activeAgentId ? rootKeyState.key : undefined;
  const keyLoading = Boolean(
    activeAgentId && rootKeyState.agentId !== activeAgentId,
  );
  const keyError =
    rootKeyState.agentId === activeAgentId ? rootKeyState.error : undefined;

  useEffect(() => {
    if (!activeAgentId || !activeSessionId || !rootKey) {
      return;
    }

    const controller = new AbortController();
    void observeEncryptedEvents({
      agentId: activeAgentId,
      afterCursor: cursorRef.current,
      keyEpoch,
      rootKey,
      sessionId: activeSessionId,
      signal: controller.signal,
      userId: user.user_id,
      onCursor(nextCursor) {
        cursorRef.current = nextCursor;
        setCursor(nextCursor);
      },
      onFrame(frame) {
        const response = parseE2EERPCResponse(frame);
        const lifecycle = response
          ? pendingLifecycle.current.get(response.requestId)
          : undefined;
        if (response && lifecycle) {
          pendingLifecycle.current.delete(response.requestId);
          setLifecycleBusy(false);
          if (response.error) {
            setStreamError(`ACP lifecycle error: ${response.error}`);
          } else {
            setCommandStatus(
              `encrypted session ready · ${lifecycle.sessionId}`,
            );
          }
        }
        const text = extractE2EEFrameText(frame);
        if (text) {
          setLiveText((current) => current + text);
        }
        setFrames((current) => [
          ...current.slice(-199),
          {
            id: nextFrameId.current++,
            receivedAt: new Date().toISOString(),
            value: frame,
          },
        ]);
      },
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setStreamError(errorMessage(error));
      }
    });

    return () => controller.abort();
  }, [activeAgentId, activeSessionId, keyEpoch, rootKey, user.user_id]);

  const displayError = streamError || keyError || "";
  const streamStatus: StreamStatus = !rootKey
    ? "locked"
    : !activeAgentId || !activeSessionId
      ? "idle"
      : displayError
        ? "error"
        : "listening";
  const canSend = Boolean(
    rootKey &&
    activeAgentId &&
    activeSessionId &&
    prompt.trim() &&
    !lifecycleBusy &&
    !sending,
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend || !rootKey || !activeSession) {
      return;
    }
    setSending(true);
    setCommandStatus("");
    setStreamError("");
    try {
      const frame = buildE2EEPromptFrame(
        `e2ee_prompt_${crypto.randomUUID()}`,
        activeSession.session_id,
        prompt,
      );
      const result = await sendEncryptedCommand({
        agentId: activeAgentId,
        frame,
        keyEpoch,
        rootKey,
        sessionId: activeSession.session_id,
        userId: user.user_id,
      });
      setCommandStatus(
        `${result.status} · ${result.command_id}${result.created ? " · created" : " · replayed"}`,
      );
      setPrompt("");
    } catch (error) {
      setStreamError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function handleCreateSession() {
    if (!rootKey || !activeAgent?.node_id || !activeAgentId || lifecycleBusy) {
      return;
    }
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd) {
      setStreamError("Working directory is required");
      return;
    }

    setLifecycleBusy(true);
    setStreamError("");
    setCommandStatus("creating Manager session…");
    let requestId = "";
    try {
      const session = await createAgentSession(
        user.user_id,
        activeAgent.node_id,
        activeAgentId,
        sessionName.trim() || "Encrypted session",
      );
      await sessionsQuery.refetch();
      resetLab();
      setLifecycleBusy(true);
      setSessionId(session.session_id);

      requestId = `e2ee_new_${crypto.randomUUID()}`;
      pendingLifecycle.current.set(requestId, {
        sessionId: session.session_id,
      });
      const result = await sendEncryptedCommand({
        agentId: activeAgentId,
        frame: buildE2EESessionNewFrame(requestId, normalizedCwd),
        keyEpoch,
        rootKey,
        sessionId: session.session_id,
        userId: user.user_id,
      });
      if (pendingLifecycle.current.has(requestId)) {
        setCommandStatus(
          `${result.status} · waiting for encrypted session/new response`,
        );
      }
    } catch (error) {
      if (requestId) {
        pendingLifecycle.current.delete(requestId);
      }
      setLifecycleBusy(false);
      setStreamError(errorMessage(error));
    }
  }

  function resetLab() {
    setFrames([]);
    setLiveText("");
    setCommandStatus("");
    setStreamError("");
    setCursor(0);
    cursorRef.current = 0;
    nextFrameId.current = 1;
    pendingLifecycle.current.clear();
    setLifecycleBusy(false);
  }

  const statusTone =
    streamStatus === "listening"
      ? "success"
      : streamStatus === "error"
        ? "danger"
        : streamStatus === "locked"
          ? "warning"
          : "neutral";

  return (
    <ConsoleLayout user={user}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-ink-tertiary">
                <LockKeyhole className="h-4 w-4" />
                Isolated transport validation
              </div>
              <h1 className="mt-2 text-2xl font-semibold">E2EE Session Lab</h1>
              <p className="mt-1 max-w-3xl text-sm text-ink-muted">
                Sends an encrypted ACP prompt and renders decrypted streaming
                frames without changing the existing session workbench.
              </p>
            </div>
            <Button asChild icon={<ArrowLeft className="h-4 w-4" />}>
              <Link href="/settings/security">Security settings</Link>
            </Button>
          </header>

          <section className="grid gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Encrypted route</h2>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone}>{streamStatus}</Badge>
                <Badge>cursor {cursor}</Badge>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-ink-tertiary">
                Agent
                <select
                  className="h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
                  onChange={(event) => {
                    resetLab();
                    setAgentId(event.target.value);
                    setSessionId("");
                  }}
                  value={activeAgentId}
                >
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name || agent.agent_type || "Agent"} ·{" "}
                      {compactId(agent.agent_id, 8, 5)} ·{" "}
                      {agent.online ? "online" : agent.status || "offline"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-ink-tertiary">
                Existing session
                <select
                  className="h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
                  disabled={!sessions.length}
                  onChange={(event) => {
                    resetLab();
                    setSessionId(event.target.value);
                  }}
                  value={activeSessionId}
                >
                  {sessions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.name || session.session_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-ink-tertiary">
                Key epoch
                <input
                  className="h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
                  min={1}
                  onChange={(event) => {
                    resetLab();
                    setKeyEpoch(Math.max(1, Number(event.target.value) || 1));
                  }}
                  type="number"
                  value={keyEpoch}
                />
              </label>
            </div>
            <div className="grid gap-1 font-mono text-xs text-ink-tertiary sm:grid-cols-2">
              <div>manager session: {activeSessionId || "none"}</div>
              <div>native session: private to paxd</div>
            </div>
            <div className="grid gap-3 rounded-md border border-hairline bg-canvas p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="grid gap-1 text-xs text-ink-tertiary">
                New session name
                <input
                  className="h-9 rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none focus:border-accent"
                  onChange={(event) => setSessionName(event.target.value)}
                  value={sessionName}
                />
              </label>
              <label className="grid gap-1 text-xs text-ink-tertiary">
                paxd working directory
                <input
                  className="h-9 rounded-md border border-hairline bg-surface-1 px-3 font-mono text-sm text-ink outline-none focus:border-accent"
                  onChange={(event) => setCwd(event.target.value)}
                  value={cwd}
                />
              </label>
              <Button
                disabled={
                  !rootKey ||
                  !activeAgent?.node_id ||
                  !cwd.trim() ||
                  lifecycleBusy
                }
                icon={<Plus className="h-4 w-4" />}
                onClick={() => void handleCreateSession()}
                type="button"
                variant="primary"
              >
                {lifecycleBusy ? "Waiting…" : "Create encrypted session"}
              </Button>
            </div>
            {!keyLoading && activeAgentId && !rootKey && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                No key is stored for this agent. Add the matching paxd root key
                in Security settings before testing.
              </div>
            )}
            {displayError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 p-3 font-mono text-xs text-danger">
                {displayError}
              </div>
            )}
          </section>

          <form
            className="grid gap-3 rounded-lg border border-hairline bg-surface-1 p-4"
            onSubmit={handleSubmit}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Encrypted prompt</h2>
              {commandStatus && (
                <span className="font-mono text-xs text-ink-tertiary">
                  {commandStatus}
                </span>
              )}
            </div>
            <textarea
              className="min-h-28 resize-y rounded-md border border-hairline bg-canvas p-3 text-sm text-ink outline-none focus:border-accent"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Send a prompt through the encrypted command table and paxd WebSocket…"
              value={prompt}
            />
            <div className="flex justify-end">
              <Button
                disabled={!canSend}
                icon={<Send className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                {sending ? "Encrypting…" : "Send encrypted prompt"}
              </Button>
            </div>
          </form>

          <section className="grid gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Radio className="h-4 w-4" /> Decrypted stream
              </h2>
              <span className="text-xs text-ink-tertiary">
                {frames.length} frames
              </span>
            </div>
            <div className="min-h-32 whitespace-pre-wrap rounded-md border border-hairline bg-canvas p-3 text-sm leading-6 text-ink">
              {liveText || "Waiting for encrypted agent output…"}
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-ink-tertiary">
                Raw decrypted ACP frames
              </summary>
              <div className="mt-2 grid max-h-96 gap-2 overflow-y-auto">
                {[...frames].reverse().map((frame) => (
                  <pre
                    className="overflow-x-auto rounded-md border border-hairline bg-canvas p-3 text-xs leading-5 text-ink-muted"
                    key={frame.id}
                  >
                    <span className="text-ink-tertiary">
                      {frame.receivedAt}
                      {"\n"}
                    </span>
                    {JSON.stringify(frame.value, null, 2)}
                  </pre>
                ))}
              </div>
            </details>
          </section>
        </div>
      </div>
    </ConsoleLayout>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}
