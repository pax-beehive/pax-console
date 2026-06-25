"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTunnelRuntime, TunnelStatus } from "./agent-tunnel-runtime";
import { SessionEvent } from "./session-events";

export function useAgentTunnel(agentId?: string, sessionId?: string) {
  const runtimeRef = useRef<AgentTunnelRuntime | null>(null);
  const [status, setStatus] = useState<TunnelStatus>("idle");
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    const runtime = new AgentTunnelRuntime({ maxReconnectAttempts: 5 });
    runtimeRef.current = runtime;

    const unsubscribeEvents = runtime.subscribe((event) => {
      setEvents((current) => [...current, event]);
    });
    const unsubscribeStatus = runtime.subscribeStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus !== "error") {
        setError(null);
      }
    });

    let active = true;
    void runtime.connect(agentId, sessionId).catch((caught) => {
      if (!active) {
        return;
      }
      const error = caught instanceof Error ? caught : new Error(String(caught));
      setError(error);
    });

    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeStatus();
      runtime.disconnect();
      runtimeRef.current = null;
    };
  }, [agentId, sessionId]);

  const sendUserMessage = useCallback(async (sessionId: string, content: string) => {
    try {
      setError(null);
      return await runtimeRef.current?.sendUserMessage(sessionId, content);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      setError(error);
      throw error;
    }
  }, []);

  return {
    error,
    events,
    status: agentId ? status : "idle",
    sendUserMessage,
  };
}
