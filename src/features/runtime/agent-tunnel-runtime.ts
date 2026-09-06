import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { SessionEvent, SessionEventListener } from "./session-events";
import { getAgentTunnelUrl } from "./tunnel-url";

export type TunnelStatus =
  | "idle"
  | "connecting"
  | "initializing"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

type StatusListener = (status: TunnelStatus) => void;

type JsonRpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type PendingRequest = {
  method: string;
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeout: number;
};

type AcpSessionResult = {
  sessionId?: string;
  session_id?: string;
};

type AcpPromptResult = {
  stopReason?: string;
  stop_reason?: string;
};

type InitializeResult = {
  authMethods?: unknown[];
};

export class AgentTunnelRuntime {
  private readonly maxReconnectAttempts: number;
  private socket?: WebSocket;
  private agentId?: string;
  private managerSessionId?: string;
  private acpSessionId?: string;
  private activeStreamId?: string;
  private reconnectAttempts = 0;
  private requestId = 1;
  private shouldReconnect = false;
  private readyPromise?: Promise<void>;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private eventListeners = new Set<SessionEventListener>();
  private statusListeners = new Set<StatusListener>();

  constructor(options?: { maxReconnectAttempts?: number }) {
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;
  }

  connect(agentId: string, sessionId?: string) {
    this.socket?.close(1000);
    this.agentId = agentId;
    this.managerSessionId = sessionId;
    this.acpSessionId = sessionId;
    this.rejectPendingRequests(new Error("Agent tunnel reconnecting"));
    this.shouldReconnect = true;
    this.setStatus(this.socket ? "reconnecting" : "connecting");
    const tunnelUrl = getAgentTunnelUrl(agentId, sessionId);
    this.socket = new WebSocket(tunnelUrl);

    this.readyPromise = new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Agent tunnel was not created"));
        return;
      }

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.bootstrapAcp()
          .then(resolve)
          .catch((error) => {
            this.setStatus("error");
            reject(error instanceof Error ? error : new Error(String(error)));
          });
      };

      this.socket.onerror = () => {
        this.setStatus("error");
        reject(new Error(`Agent tunnel socket error: ${tunnelUrl}`));
      };

      this.socket.onmessage = (message) => {
        this.handleMessage(message.data as string);
      };

      this.socket.onclose = (event) => {
        this.socket = undefined;
        this.acpSessionId = this.managerSessionId;
        this.rejectPendingRequests(new Error("Agent tunnel closed"));

        if (
          !this.shouldReconnect ||
          event.code === 1000 ||
          isAuthCloseCode(event.code)
        ) {
          this.setStatus("closed");
          return;
        }

        this.scheduleReconnect();
      };
    });

    return this.readyPromise;
  }

  disconnect() {
    this.shouldReconnect = false;
    this.rejectPendingRequests(new Error("Agent tunnel disconnected"));
    this.socket?.close(1000);
    this.socket = undefined;
    this.managerSessionId = undefined;
    this.acpSessionId = undefined;
    this.clearActiveStream();
    this.setStatus("closed");
  }

  async sendUserMessage(paxSessionId: string, content: string) {
    await this.ensureReady();
    const acpSessionId = await this.ensureAcpSession();
    const resolvedSessionId = acpSessionId || paxSessionId;
    const prompt = [{ type: "text", text: content }];
    this.activeStreamId = `${resolvedSessionId}:turn:${Date.now()}`;

    this.emitEvent({
      type: "user_message",
      id: `${resolvedSessionId}:user:${Date.now()}`,
      sessionId: resolvedSessionId,
      content,
      createdAt: new Date().toISOString(),
    });

    const result = (await this.request("session/prompt", {
      sessionId: acpSessionId,
      prompt,
    })) as AcpPromptResult;

    if (this.shouldBindNativeSessionAfterPrompt(result, acpSessionId)) {
      const reboundSessionId = await this.createAcpSession();
      await this.request("session/prompt", {
        sessionId: reboundSessionId,
        prompt,
      });
    }

    return { sessionId: resolvedSessionId };
  }

  subscribe(listener: SessionEventListener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async bootstrapAcp() {
    this.setStatus("initializing");
    const initializeResult = (await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        session: {
          configOptions: {
            boolean: {},
          },
        },
      },
      clientInfo: {
        name: "pax-console",
        version: "0.1.0",
      },
    })) as InitializeResult;

    const methodId = pickAuthMethodId(initializeResult.authMethods);
    if (methodId) {
      await this.request("authenticate", { methodId });
    }

    this.setStatus("connected");
  }

  private async ensureReady() {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Agent tunnel is not connected");
    }

    await this.readyPromise;
  }

  private async ensureAcpSession() {
    if (this.acpSessionId) {
      return this.acpSessionId;
    }

    if (this.managerSessionId) {
      this.acpSessionId = this.managerSessionId;
      return this.acpSessionId;
    }

    return this.createAcpSession();
  }

  private async createAcpSession() {
    const result = (await this.request("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })) as AcpSessionResult;
    const sessionId = result.sessionId ?? result.session_id;
    if (!sessionId) {
      throw new Error("ACP session/new did not return a sessionId");
    }

    this.acpSessionId = sessionId;
    return sessionId;
  }

  private shouldBindNativeSessionAfterPrompt(
    result: AcpPromptResult | undefined,
    acpSessionId: string,
  ) {
    const stopReason = result?.stopReason ?? result?.stop_reason;
    return Boolean(
      this.managerSessionId &&
      acpSessionId === this.managerSessionId &&
      stopReason === "refusal",
    );
  }

  private request(method: string, params?: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Agent tunnel is not connected"));
    }

    const id = this.requestId++;
    const frame = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, 30_000);

      this.pendingRequests.set(id, { method, reject, resolve, timeout });
      this.socket?.send(JSON.stringify(frame));
    });
  }

  private handleMessage(rawMessage: string) {
    try {
      const frame = JSON.parse(rawMessage) as JsonRpcResponse;

      if (frame.id !== undefined && this.pendingRequests.has(frame.id)) {
        const pending = this.pendingRequests.get(frame.id);
        if (!pending) {
          return;
        }

        window.clearTimeout(pending.timeout);
        this.pendingRequests.delete(frame.id);

        if (frame.error) {
          pending.reject(
            new Error(frame.error.message ?? `ACP request failed: ${frame.id}`),
          );
          return;
        }

        if (pending.method === "session/prompt") {
          this.emitNormalizedEvents(frame);
        }

        pending.resolve(frame.result);
        return;
      }

      this.emitNormalizedEvents(frame);
    } catch {
      this.setStatus("error");
    }
  }

  private emitNormalizedEvents(frame: unknown) {
    for (const event of normalizeTunnelFrame(frame, {
      streamId: this.activeStreamId,
    })) {
      this.emitEvent(event);
      this.updateActiveStream(event);
    }
  }

  private emitEvent(event: SessionEvent) {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private updateActiveStream(event: SessionEvent) {
    if (
      (event.type === "agent_message" || event.type === "progress") &&
      event.streaming === true
    ) {
      return;
    }

    if (
      event.type === "turn_done" ||
      (event.type === "run_status" &&
        (event.status === "done" || event.status === "error"))
    ) {
      this.clearActiveStream();
    }
  }

  private clearActiveStream() {
    this.activeStreamId = undefined;
  }

  private rejectPendingRequests(error: Error) {
    for (const [id, pending] of this.pendingRequests) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.shouldReconnect = false;
      this.setStatus("error");
      return;
    }

    this.setStatus("reconnecting");
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, 20_000);
    this.reconnectAttempts += 1;

    window.setTimeout(
      () => {
        if (this.shouldReconnect && this.agentId) {
          void this.connect(this.agentId, this.managerSessionId).catch(() => {
            // Connection state is already reflected through status listeners.
          });
        }
      },
      delay + Math.floor(Math.random() * 250),
    );
  }

  private setStatus(status: TunnelStatus) {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

function pickAuthMethodId(authMethods: unknown[] | undefined) {
  if (!authMethods || authMethods.length === 0) {
    return undefined;
  }

  for (const method of authMethods) {
    if (typeof method === "string" && method.length > 0) {
      return method;
    }

    if (typeof method === "object" && method !== null) {
      const record = method as Record<string, unknown>;
      const id = record.methodId ?? record.id ?? record.name;
      if (typeof id === "string" && id.length > 0 && id !== "none") {
        return id;
      }
    }
  }

  return undefined;
}

function isAuthCloseCode(code: number) {
  return code === 1008 || code === 4001 || code === 4401 || code === 4403;
}
