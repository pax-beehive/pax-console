/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        onFrame: (frame: unknown) => void | Promise<void>;
        signal?: AbortSignal;
      }
    | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadRootKey.mockResolvedValue(new Uint8Array(32).fill(7));
    mocks.loadEncryptedSessionHistory.mockResolvedValue({
      messages: [],
      pagination: { has_more: false, next_before_id: 0 },
    });
    mocks.observeEncryptedEvents.mockImplementation(
      (options: {
        onFrame: (frame: unknown) => void | Promise<void>;
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
      await observerOptions?.onFrame({
        id: frame.id,
        jsonrpc: "2.0",
        result: { sessionId: "session_1" },
      });
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
