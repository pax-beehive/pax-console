import { describe, expect, it, vi } from "vitest";
import type { HistoryMessage } from "@/features/api/types";
import { retrySessionHistoryHandoff } from "./session-history-handoff";

describe("retrySessionHistoryHandoff", () => {
  it("retries until durable history contains the target turn boundary", async () => {
    const refetch = vi
      .fn<() => Promise<HistoryMessage[]>>()
      .mockResolvedValueOnce([
        message("msg_1", "agent_message_chunk", "turn_1"),
      ])
      .mockResolvedValueOnce([
        message("msg_1", "agent_message_chunk", "turn_1"),
        message("msg_2", "turn_done", "turn_1"),
      ]);
    const wait = vi.fn(async () => undefined);

    const result = await retrySessionHistoryHandoff({
      refetch,
      targetTurnId: "turn_1",
      wait,
    });

    expect(result).toEqual({ attempts: 2, completed: true });
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("uses a newly persisted turn boundary when the runtime turn id is unknown", async () => {
    const refetch = vi.fn(async () => [
      message("done_old", "turn_done", "turn_old"),
      message("done_new", "turn_done", "turn_new"),
    ]);

    const result = await retrySessionHistoryHandoff({
      baselineCompletionMessageIds: ["done_old"],
      refetch,
      targetTurnId: "pending-turn:123",
      wait: vi.fn(async () => undefined),
    });

    expect(result).toEqual({ attempts: 1, completed: true });
  });

  it("stops after the configured attempt limit", async () => {
    const refetch = vi.fn(async () => [
      message("msg_1", "agent_message_chunk", "turn_1"),
    ]);
    const wait = vi.fn(async () => undefined);

    const result = await retrySessionHistoryHandoff({
      maxAttempts: 3,
      refetch,
      targetTurnId: "turn_1",
      wait,
    });

    expect(result).toEqual({ attempts: 3, completed: false });
    expect(refetch).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("retries transient history failures and caps exponential backoff", async () => {
    const refetch = vi
      .fn<() => Promise<HistoryMessage[]>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue([]);
    const wait = vi.fn(async () => undefined);

    const result = await retrySessionHistoryHandoff({
      maxAttempts: 4,
      maxRetryDelayMs: 300,
      refetch,
      retryDelayMs: 250,
      targetTurnId: "turn_1",
      wait,
    });

    expect(result).toEqual({ attempts: 4, completed: false });
    expect(wait.mock.calls).toEqual([[250], [300], [300]]);
  });
});

function message(
  messageId: string,
  messageType: string,
  turnId: string,
): HistoryMessage {
  return {
    message_id: messageId,
    message_type: messageType,
    turn_id: turnId,
  };
}
