import type { ConversationRunStatus } from "./use-conversation-run";
import type { SessionObserverStatus } from "./session-observer";

export type SessionDisplayStatus = ConversationRunStatus;

export function sessionDisplayStatus({
  conversationStatus,
  observerStatus,
  reportedStatus,
  remoteTurnActive,
}: {
  conversationStatus: ConversationRunStatus;
  observerStatus: SessionObserverStatus;
  reportedStatus?: string;
  remoteTurnActive: boolean;
}): SessionDisplayStatus {
  if (conversationStatus === "error") {
    return "error";
  }
  if (
    conversationStatus === "waiting_approval" ||
    reportedStatus === "waiting_approval"
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
