import type { ConversationRunStatus } from "./use-conversation-run";

export type SessionDisplayStatus = ConversationRunStatus;

export function sessionDisplayStatus(
  runtimeStatus?: string,
  options?: {
    ownedConversationStatus?: ConversationRunStatus;
  },
): SessionDisplayStatus {
  if (
    options?.ownedConversationStatus === "done" ||
    options?.ownedConversationStatus === "cancelled" ||
    options?.ownedConversationStatus === "error"
  ) {
    return options.ownedConversationStatus;
  }
  if (options?.ownedConversationStatus === "waiting_approval") {
    return "waiting_approval";
  }
  if (options?.ownedConversationStatus === "streaming") {
    return "streaming";
  }
  if (runtimeStatus === "waiting_approval") {
    return "waiting_approval";
  }
  if (runtimeStatus === "running") {
    return "streaming";
  }
  return "idle";
}

export function isConversationIdleTimeout(error?: Error | null) {
  return error?.message.toLowerCase().includes("idle timed out") ?? false;
}

export function isConversationObserverRecoverableError(error?: Error | null) {
  if (!error) {
    return false;
  }
  if (isConversationIdleTimeout(error) || error.name === "TypeError") {
    return true;
  }
  return /failed to fetch|load failed|network(?:error| error| request failed)/i.test(
    error.message,
  );
}
