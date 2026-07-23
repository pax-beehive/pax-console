import type { ConversationRunStatus } from "./use-conversation-run";
import type { SessionObserverStatus } from "./session-observer";

export type SessionDisplayStatus = ConversationRunStatus;

export function sessionDisplayStatus({
  autoApprove = false,
  conversationError,
  conversationStatus,
  observerStatus,
  reportedStatus,
  remoteTurnActive,
}: {
  autoApprove?: boolean;
  conversationError?: Error | null;
  conversationStatus: ConversationRunStatus;
  observerStatus: SessionObserverStatus;
  reportedStatus?: string;
  remoteTurnActive: boolean;
}): SessionDisplayStatus {
  const conversationErrorRecovered =
    conversationStatus === "error" &&
    isConversationObserverRecoverableError(conversationError) &&
    observerStatus === "observing";
  if (conversationStatus === "error" && !conversationErrorRecovered) {
    return "error";
  }
  if (
    !autoApprove &&
    (conversationStatus === "waiting_approval" ||
      reportedStatus === "waiting_approval")
  ) {
    return "waiting_approval";
  }
  if (observerStatus === "error") {
    return "error";
  }
  if (conversationStatus === "streaming" || observerStatus === "observing") {
    return "streaming";
  }
  if (conversationStatus === "done" || observerStatus === "done") {
    return "done";
  }
  if (remoteTurnActive) {
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
