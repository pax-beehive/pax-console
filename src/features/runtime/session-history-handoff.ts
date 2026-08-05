import type { HistoryMessage } from "@/features/api/types";

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 1_500;

type RetrySessionHistoryHandoffOptions = {
  baselineCompletionMessageIds?: string[];
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  refetch: () => Promise<HistoryMessage[]>;
  retryDelayMs?: number;
  targetTurnId?: string;
  wait?: (delayMs: number) => Promise<void>;
};

export async function retrySessionHistoryHandoff({
  baselineCompletionMessageIds = [],
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  refetch,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  targetTurnId,
  wait = waitForRetry,
}: RetrySessionHistoryHandoffOptions) {
  const attemptLimit = Math.max(1, maxAttempts);
  const baselineCompletions = new Set(baselineCompletionMessageIds);

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      const messages = await refetch();
      if (
        historyContainsHandoffBoundary(
          messages,
          targetTurnId,
          baselineCompletions,
        )
      ) {
        return { attempts: attempt, completed: true };
      }
    } catch {
      // A terminal handoff is best-effort recovery. Retry transient history
      // failures while leaving error presentation to the owning query.
    }

    if (attempt < attemptLimit) {
      await wait(Math.min(retryDelayMs * 2 ** (attempt - 1), maxRetryDelayMs));
    }
  }

  return { attempts: attemptLimit, completed: false };
}

function historyContainsHandoffBoundary(
  messages: HistoryMessage[],
  targetTurnId: string | undefined,
  baselineCompletions: Set<string>,
) {
  const completionMessages = messages.filter(
    (message) => message.message_type === "turn_done",
  );
  const durableTargetTurnId = isDurableTurnId(targetTurnId)
    ? targetTurnId
    : undefined;

  if (durableTargetTurnId) {
    return completionMessages.some(
      (message) => message.turn_id === durableTargetTurnId,
    );
  }

  return completionMessages.some(
    (message) => !baselineCompletions.has(message.message_id),
  );
}

function isDurableTurnId(turnId?: string): turnId is string {
  return Boolean(turnId && !turnId.startsWith("pending-turn:"));
}

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, delayMs));
  });
}
