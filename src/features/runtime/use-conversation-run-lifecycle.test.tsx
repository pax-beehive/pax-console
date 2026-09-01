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

  it("initializes an empty session without creating optimistic turn events", async () => {
    mocks.streamConversationRun.mockImplementationOnce(async (options) => {
      options.onEnvelope({
        type: "session",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_empty",
      });
      options.onEnvelope({
        type: "done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_empty",
      });
    });
    const onSession = vi.fn();
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        onSession,
        userId: "user_1",
      }),
    );

    await act(async () => {
      await result.current.initializeSession({ cwd: "~/project" });
    });

    expect(mocks.streamConversationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        initializeOnly: true,
        cwd: "~/project",
      }),
    );
    expect(onSession).toHaveBeenCalledWith("sess_empty");
    expect(result.current.events).toEqual([]);
    expect(result.current.status).toBe("done");
  });
});
