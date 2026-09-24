/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationRun } from "./use-conversation-run";
import { ApiError } from "../api/errors";

const mocks = vi.hoisted(() => ({
  streamConversationRun: vi.fn(),
}));

vi.mock("./conversation-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conversation-run")>()),
  streamConversationRun: mocks.streamConversationRun,
}));

describe("useConversationRun lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps an accepted conversation on resume without resending or cancelling", async () => {
    let options!: Parameters<
      typeof import("./conversation-run").streamConversationRun
    >[0];
    let finish!: () => void;
    mocks.streamConversationRun.mockImplementationOnce((value) => {
      options = value;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const resume = () => {
      act(() => {
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );
    let sending!: ReturnType<typeof result.current.sendMessage>;
    act(() => {
      sending = result.current.sendMessage("New prompt");
    });
    resume();
    expect(result.current.transportInterrupted).toBe(false);
    act(() =>
      options.onEnvelope({
        type: "turn_started",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        turn_id: "turn_1",
      }),
    );
    resume();
    expect(result.current.transportInterrupted).toBe(false);
    expect(result.current.status).toBe("streaming");
    await waitFor(() =>
      expect(result.current.events).toContainEqual(
        expect.objectContaining({
          type: "user_message",
          content: "New prompt",
          turnId: "turn_1",
        }),
      ),
    );
    expect(options.signal?.aborted).toBe(false);
    expect(mocks.streamConversationRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await sending;
    });
  });
  beforeEach(() => {
    mocks.streamConversationRun.mockReset();
  });

  it.each(["streaming", "waiting_approval"] as const)(
    "reconciles stale %s from a fresh idle read even when polling missed running",
    async (localStatus) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(100);
      let options!: Parameters<
        typeof import("./conversation-run").streamConversationRun
      >[0];
      mocks.streamConversationRun.mockImplementationOnce((value) => {
        options = value;
        return new Promise(() => {});
      });
      const { result, rerender, unmount } = renderHook(
        ({ snapshot }) =>
          useConversationRun({
            agentId: "agent_1",
            nodeId: "node_1",
            sessionId: "sess_1",
            userId: "user_1",
            runtimeSnapshot: snapshot,
          }),
        { initialProps: { snapshot: { status: "idle", requestedAt: 50 } } },
      );
      act(() => {
        void result.current.sendMessage("new turn");
      });
      expect(result.current.status).toBe("streaming");
      clock.mockReturnValue(200);
      act(() =>
        options.onEnvelope({
          type: "turn_started",
          node_id: "node_1",
          agent_id: "agent_1",
          session_id: "sess_1",
          turn_id: "turn_1",
        }),
      );
      if (localStatus === "waiting_approval") {
        act(() =>
          options.onEnvelope({
            type: "interrupted",
            reason: "permission_required",
            session_id: "sess_1",
          }),
        );
      }
      // A request started before acceptance can arrive after it: ignore it.
      rerender({ snapshot: { status: "idle", requestedAt: 150 } });
      expect(result.current.status).toBe(localStatus);
      // Manager idle has no runtime_turn_instance_id. History head may lag;
      // neither that ID nor a prior observed running snapshot is a prerequisite.
      rerender({ snapshot: { status: "idle", requestedAt: 300 } });
      await waitFor(() => expect(result.current.status).toBe("idle"));
      expect(result.current.transportInterrupted).toBe(false);
      // Old idle must not finish the next prompt in the same mounted session.
      clock.mockReturnValue(400);
      act(() => {
        void result.current.sendMessage("next turn");
      });
      expect(result.current.status).toBe("streaming");
      unmount();
    },
  );

  it("ignores late completion from an old observer after a new prompt starts", () => {
    mocks.streamConversationRun.mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );
    act(() => {
      void result.current.sendMessage("new turn");
    });
    act(() => result.current.finishObservedTurn("previous"));
    expect(result.current.status).toBe("streaming");
    unmount();
  });

  it("refreshes on ACP end_turn before durable completion and ignores old stream frames", async () => {
    const streams: Parameters<
      typeof import("./conversation-run").streamConversationRun
    >[0][] = [];
    const finishes: (() => void)[] = [];
    mocks.streamConversationRun.mockImplementation((options) => {
      streams.push(options);
      return new Promise<void>((resolve) => finishes.push(resolve));
    });
    const onTurnEnd = vi.fn();
    const { result, unmount } = renderHook(() =>
      useConversationRun({
        agentId: "agent",
        nodeId: "node",
        sessionId: "session",
        userId: "self",
        onTurnEnd,
      }),
    );
    act(() => {
      void result.current.sendMessage("first");
    });
    const end = {
      type: "acp" as const,
      agent_id: "agent",
      node_id: "node",
      session_id: "session",
      turn_id: "first",
      frame: { jsonrpc: "2.0", id: 1, result: { stopReason: "end_turn" } },
    };
    act(() => streams[0].onEnvelope(end));
    expect(result.current.status).toBe("done");
    expect(onTurnEnd).toHaveBeenCalledWith("first");
    expect(result.current.completedTurnVersion).toBe(0);
    act(() => {
      void result.current.sendMessage("second");
    });
    await act(async () => {
      streams[0].onEnvelope(end);
      finishes[0]();
    });
    expect(result.current.status).toBe("streaming");
    expect(onTurnEnd).toHaveBeenCalledTimes(1);
    unmount();
    finishes[1]();
  });

  it("does not acknowledge a prompt rejected before the turn starts", async () => {
    mocks.streamConversationRun.mockRejectedValueOnce(
      new ApiError("Agent unavailable", 409, null),
    );
    const onAccepted = vi.fn();
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );
    await act(async () => {
      await expect(
        result.current.sendMessage("See screenshot", {
          attachmentIds: ["att_1"],
          onAccepted,
        }),
      ).rejects.toThrow("Agent unavailable");
    });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
  });

  it("acknowledges sent attachments before the response stream finishes", async () => {
    let streamOptions!: Parameters<
      typeof import("./conversation-run").streamConversationRun
    >[0];
    let finish!: () => void;
    mocks.streamConversationRun.mockImplementationOnce((options) => {
      streamOptions = options;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const onAccepted = vi.fn();
    const attachment = {
      attachmentId: "att_1",
      filename: "Screenshot.png",
      contentType: "image/png",
    };
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );
    let sending!: ReturnType<typeof result.current.sendMessage>;
    act(() => {
      sending = result.current.sendMessage("See screenshot", {
        attachmentIds: ["att_1"],
        attachments: [attachment],
        onAccepted,
      });
    });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(result.current.events).toContainEqual(
      expect.objectContaining({
        type: "user_message",
        content: "See screenshot",
        attachments: [attachment],
      }),
    );
    act(() => {
      const started = {
        type: "turn_started" as const,
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        turn_id: "turn_1",
      };
      streamOptions.onEnvelope(started);
      streamOptions.onEnvelope(started);
    });
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("streaming");
    expect(streamOptions.content).toEqual([
      { type: "text", text: "See screenshot" },
      { type: "attachment", attachment_id: "att_1" },
    ]);
    await act(async () => {
      finish();
      await sending;
    });
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
