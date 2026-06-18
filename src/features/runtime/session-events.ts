export type SessionEvent =
  | {
      type: "user_message";
      id: string;
      sessionId: string;
      content: string;
      createdAt: string;
    }
  | {
      type: "agent_message";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      createdAt: string;
    }
  | {
      type: "progress";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      createdAt: string;
    }
  | {
      type: "tool_call";
      id: string;
      sessionId: string;
      name: string;
      status: "queued" | "running" | "done" | "error";
      input?: unknown;
      output?: unknown;
      durationMs?: number;
      createdAt: string;
    }
  | {
      type: "file_change";
      id: string;
      sessionId: string;
      path: string;
      tool?: string;
      oldContent?: string;
      newContent?: string;
      createdAt: string;
    }
  | {
      type: "run_status";
      id: string;
      sessionId: string;
      status: "idle" | "running" | "waiting_approval" | "done" | "error";
      createdAt: string;
    }
  | {
      type: "token_usage";
      id: string;
      sessionId: string;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      createdAt: string;
    };

export type SessionEventListener = (event: SessionEvent) => void;
