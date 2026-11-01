/* @vitest-environment jsdom */

import { PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import type { HistoryMessage } from "@/features/api/types";
import { useSessionMessageWindow } from "./session-message-window";

const mocks = vi.hoisted(() => ({ read: vi.fn(), history: vi.fn() }));
vi.mock("@/features/api/workspace-search", () => ({
  readWorkspaceSource: mocks.read,
  isWorkspaceMessageRead: (value: object) => "message_id" in value,
}));
vi.mock("@/features/api/resources", async (original) => ({
  ...(await original<typeof import("@/features/api/resources")>()),
  listSessionHistory: mocks.history,
}));

const message = (id: string, seq: number): HistoryMessage => ({
  message_id: id,
  session_id: "pax-session",
  session_seq: seq,
});
let client: QueryClient;
function Wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const options = {
  userId: "owner",
  sessionId: "pax-session",
  agentId: "pax-agent",
  messageId: "target",
  enabled: true,
  loadedMessages: [] as HistoryMessage[],
};
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.read.mockReset().mockResolvedValue({
    message_id: "target",
    agent_id: "pax-agent",
    session_id: "pax-session",
    session_seq: 51,
  });
  mocks.history
    .mockReset()
    .mockImplementation((_owner, _session, _limit, cursor) =>
      Promise.resolve(
        cursor.beforeSeq
          ? {
              messages: [message("before", 50), message("target", 51)],
              pagination: { has_older: true, next_before_seq: 50 },
            }
          : {
              messages: [message("after", 52)],
              pagination: { has_newer: true, next_after_seq: 52 },
            },
      ),
    );
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("Opening an exact session message", () => {
  it("resolves an unloaded canonical ID and reads only a bounded window, with existing cursors in both directions", async () => {
    const { result } = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.read).toHaveBeenCalledWith(
      "owner",
      { ref: { kind: "message", id: "target" }, limit: 1 },
      expect.any(AbortSignal),
    );
    expect(mocks.history.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      ["owner", "pax-session", 26, { beforeSeq: 52 }],
      ["owner", "pax-session", 25, { afterSeq: 51 }],
    ]);
    expect(result.current.messages.map((m) => m.message_id)).toEqual([
      "before",
      "target",
      "after",
    ]);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPreviousPage).toBe(true);
    mocks.history.mockResolvedValueOnce({
      messages: [message("earlier", 49)],
      pagination: { has_older: false },
    });
    await act(() => result.current.fetchNextPage());
    await waitFor(() =>
      expect(
        result.current.messages.map((message) => message.message_id),
      ).toContain("earlier"),
    );
    expect(mocks.history).toHaveBeenLastCalledWith(
      "owner",
      "pax-session",
      50,
      { beforeSeq: 50 },
      expect.any(AbortSignal),
    );
    mocks.history.mockResolvedValueOnce({
      messages: [message("later", 53)],
      pagination: { has_newer: false },
    });
    await act(() => result.current.fetchPreviousPage());
    expect(mocks.history).toHaveBeenLastCalledWith(
      "owner",
      "pax-session",
      50,
      { afterSeq: 52 },
      expect.any(AbortSignal),
    );
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.message_id)).toEqual([
        "earlier",
        "before",
        "target",
        "after",
        "later",
      ]),
    );
  });

  it("uses already loaded history without extra reads, and does nothing for session-only links", () => {
    const { result, rerender } = renderHook(
      ({ messageId }) =>
        useSessionMessageWindow({
          ...options,
          messageId,
          loadedMessages: [message("target", 51)],
        }),
      {
        wrapper: Wrapper,
        initialProps: { messageId: "target" as string | undefined },
      },
    );
    expect(result.current.focused).toBe(false);
    rerender({ messageId: undefined });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Number.MAX_SAFE_INTEGER])(
    "rejects an unusable sequence %s without fetching history",
    async (session_seq) => {
      mocks.read.mockResolvedValue({
        message_id: "target",
        agent_id: "pax-agent",
        session_id: "pax-session",
        session_seq,
      });
      const { result } = renderHook(() => useSessionMessageWindow(options), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mocks.history).not.toHaveBeenCalled();
    },
  );

  it("rejects an anchor from a different PAX session", async () => {
    mocks.read.mockResolvedValue({
      message_id: "target",
      session_id: "native-session",
      session_seq: 51,
    });
    const { result } = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("rejects a different agent before loading any context", async () => {
    mocks.read.mockResolvedValue({
      message_id: "target",
      session_id: "pax-session",
      agent_id: "other-agent",
      session_seq: 51,
    });
    const { result } = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("does not treat a missing target in the returned window as a successful jump", async () => {
    mocks.history.mockResolvedValue({
      messages: [message("other", 1)],
      pagination: {},
    });
    const { result } = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.messages).toEqual([]);
  });

  it("hides cached window messages after an authorization failure", async () => {
    const { result } = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    mocks.read.mockRejectedValue(new ApiError("Forbidden", 403, {}));
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.messages).toEqual([]);
  });

  it("revalidates a revisited deep link and keeps an old successful window hidden if access was revoked", async () => {
    const first = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(first.result.current.messages).toHaveLength(3));
    first.unmount();
    mocks.read.mockRejectedValue(new ApiError("Forbidden", 403, {}));
    const second = renderHook(() => useSessionMessageWindow(options), {
      wrapper: Wrapper,
    });
    expect(second.result.current.messages).toEqual([]);
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.messages).toEqual([]);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it("cancels the old read and never shows it under another target or identity", async () => {
    let oldSignal: AbortSignal | undefined;
    let resolveOld!: (value: object) => void;
    mocks.read.mockImplementationOnce((_user, _ref, signal) => {
      oldSignal = signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    });
    const { result, rerender } = renderHook(
      ({ userId, messageId }) =>
        useSessionMessageWindow({ ...options, userId, messageId }),
      {
        wrapper: Wrapper,
        initialProps: { userId: "owner", messageId: "target" },
      },
    );
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    mocks.read.mockResolvedValue({
      message_id: "new",
      agent_id: "pax-agent",
      session_id: "pax-session",
      session_seq: 5,
    });
    mocks.history.mockResolvedValue({
      messages: [message("new", 5)],
      pagination: {},
    });
    rerender({ userId: "other-owner", messageId: "new" });
    expect(result.current.messages).toEqual([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () =>
      resolveOld({
        message_id: "target",
        session_id: "pax-session",
        session_seq: 51,
      }),
    );
    expect(result.current.messages.map((m) => m.message_id)).toEqual(["new"]);
  });
});
