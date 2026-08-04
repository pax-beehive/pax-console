/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationRun } from "./use-conversation-run";

const mocks = vi.hoisted(() => ({
  streamConversationRun: vi.fn(),
}));

vi.mock("./conversation-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conversation-run")>()),
  streamConversationRun: mocks.streamConversationRun,
}));

describe("useConversationRun lifecycle", () => {
  beforeEach(() => {
    mocks.streamConversationRun.mockReset();
  });

  it("marks a locally owned turn cancelled as soon as stop is acknowledged", () => {
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );

    act(() => result.current.markCancelled());

    expect(result.current.status).toBe("cancelled");
  });

  it("hands a recoverable conversation transport failure to the observer", async () => {
    mocks.streamConversationRun.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );

    await act(async () => {
      await result.current.sendMessage("continue working");
    });

    expect(result.current.status).toBe("streaming");
    expect(result.current.transportInterrupted).toBe(true);
    expect(result.current.error).toMatchObject({ message: "Failed to fetch" });

    act(() => result.current.markObserverConnected());

    expect(result.current.status).toBe("streaming");
    expect(result.current.transportInterrupted).toBe(true);
    expect(result.current.error).toBeNull();

    act(() => result.current.finishObservedTurn());

    expect(result.current.status).toBe("done");
    expect(result.current.transportInterrupted).toBe(false);
  });
});
