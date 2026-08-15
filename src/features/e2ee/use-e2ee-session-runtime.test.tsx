/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedEventContext } from "./transport";
import { useE2EESessionRuntime } from "./use-e2ee-session-runtime";

const mocks = vi.hoisted(() => ({
  loadEncryptedSessionHistory: vi.fn(),
  loadRootKey: vi.fn(),
  observeEncryptedEvents: vi.fn(),
  sendEncryptedCommand: vi.fn(),
}));

vi.mock("./root-key-store", () => ({ loadRootKey: mocks.loadRootKey }));
vi.mock("./transport", () => ({
  loadEncryptedSessionHistory: mocks.loadEncryptedSessionHistory,
  observeEncryptedEvents: mocks.observeEncryptedEvents,
  sendEncryptedCommand: mocks.sendEncryptedCommand,
}));

describe("useE2EESessionRuntime", () => {
  let observerOptions:
    | {
        onFrame: (
          frame: unknown,
          context: EncryptedEventContext,
        ) => void | Promise<void>;
        signal?: AbortSignal;
      }
    | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    observerOptions = undefined;
    mocks.loadRootKey.mockResolvedValue(new Uint8Array(32).fill(7));
    mocks.loadEncryptedSessionHistory.mockResolvedValue({
      messages: [],
      pagination: { has_more: false, next_before_id: 0 },
    });
    mocks.observeEncryptedEvents.mockImplementation(
      (options: {
        onFrame: (
          frame: unknown,
          context: EncryptedEventContext,
        ) => void | Promise<void>;
        signal?: AbortSignal;
      }) =>
        new Promise<number>((resolve) => {
          observerOptions = options;
          options.signal?.addEventListener("abort", () => resolve(0), {
            once: true,
          });
        }),
    );
    mocks.sendEncryptedCommand.mockResolvedValue({
      command_id: "cmd_1",
      created: true,
      status: "pending",
    });
  });

  it("waits for the encrypted session/new response before completing bootstrap", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId: "session_1",
          userId: "user_1",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rootKeyAvailable).toBe(true));
    await waitFor(() => expect(observerOptions).toBeDefined());

    let bootstrap: Promise<void> | undefined;
    act(() => {
      bootstrap = result.current.startSession("/work/private");
    });
    await waitFor(() => expect(mocks.sendEncryptedCommand).toHaveBeenCalled());
    const frame = mocks.sendEncryptedCommand.mock.calls[0]?.[0].frame;
    expect(frame).toEqual(
      expect.objectContaining({
        method: "session/new",
        params: { cwd: "/work/private", mcpServers: [] },
      }),
    );

    await act(async () => {
      await observerOptions?.onFrame(
        {
          id: frame.id,
          jsonrpc: "2.0",
          result: { sessionId: "session_1" },
        },
        {},
      );
      await bootstrap;
    });
    expect(result.current.status).toBe("done");
  });

  it("loads the agent key and sends a prompt through encrypted transport", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId: "session_1",
          userId: "user_1",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.rootKeyAvailable).toBe(true));
    await act(async () => {
      await result.current.sendMessage("hello encrypted world");
    });

    expect(mocks.sendEncryptedCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_1",
        sessionId: "session_1",
        userId: "user_1",
        frame: expect.objectContaining({ method: "session/prompt" }),
      }),
    );
    expect(result.current.status).toBe("streaming");
    expect(result.current.events).toEqual([
      expect.objectContaining({
        content: "hello encrypted world",
        sessionId: "session_1",
        turnId: expect.stringMatching(/^pending-turn:e2ee_prompt_/),
        type: "user_message",
      }),
    ]);
  });

  it("adopts the encrypted live turn for optimistic and streamed events", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId: "session_1",
          userId: "user_1",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rootKeyAvailable).toBe(true));
    await waitFor(() => expect(observerOptions).toBeDefined());
    await act(async () => {
      await result.current.sendMessage("private prompt");
    });

    await act(async () => {
      await observerOptions?.onFrame(
        {
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "native_1",
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: "private thought" },
            },
          },
        },
        { turnId: "turn_1" },
      );
    });

    expect(result.current.events).toMatchObject([
      { type: "user_message", turnId: "turn_1" },
      { type: "progress", turnId: "turn_1", content: "private thought" },
    ]);
  });

  it("keeps long encrypted streaming answers intact instead of dropping early chunks", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId: "session_1",
          userId: "user_1",
        }),
      { wrapper },
    );
    await waitFor(() => expect(observerOptions).toBeDefined());

    await act(async () => {
      for (let index = 0; index < 520; index += 1) {
        await observerOptions?.onFrame(
          {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session_1",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "你" },
              },
            },
          },
          { turnId: "turn_1" },
        );
      }
    });

    expect(result.current.events).toEqual([
      {
        type: "agent_message",
        id: "session_1:agent_message_chunk:e2ee:session_1:turn_1",
        sessionId: "session_1",
        turnId: "turn_1",
        content: "你".repeat(520),
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: expect.any(String),
      },
    ]);
  });

  it("clears live events when switching encrypted sessions on the same agent", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { rerender, result } = renderHook(
      ({ sessionId }: { sessionId: string }) =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId,
          userId: "user_1",
        }),
      { initialProps: { sessionId: "session_1" }, wrapper },
    );
    await waitFor(() => expect(observerOptions).toBeDefined());

    const frame = {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "session_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "one private answer" },
        },
      },
    };
    await act(async () => {
      await observerOptions?.onFrame(frame, {});
    });
    expect(result.current.events).toHaveLength(1);

    rerender({ sessionId: "session_2" });

    await waitFor(() => expect(result.current.events).toEqual([]));
    expect(mocks.loadRootKey).toHaveBeenCalledTimes(1);
  });

  it("stays locked when this browser has no root key", async () => {
    mocks.loadRootKey.mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId: "session_1",
          userId: "user_1",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe("locked"));
    await expect(result.current.sendMessage("secret")).rejects.toThrow(
      "does not have the root key",
    );
    expect(mocks.sendEncryptedCommand).not.toHaveBeenCalled();
  });
});
