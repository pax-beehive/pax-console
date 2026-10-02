/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedEventContext } from "./transport";
import { useE2EESessionRuntime } from "./use-e2ee-session-runtime";

const mocks = vi.hoisted(() => ({
  loadEncryptedTurn: vi.fn(),
  loadRootKey: vi.fn(),
  uploadEncryptedAttachment: vi.fn(),
  observeEncryptedEvents: vi.fn(),
  sendEncryptedCommand: vi.fn(),
}));

vi.mock("./attachments", () => ({
  uploadEncryptedAttachment: mocks.uploadEncryptedAttachment,
}));

vi.mock("./root-key-store", () => ({ loadRootKey: mocks.loadRootKey }));
vi.mock("./transport", () => ({
  observeEncryptedEvents: mocks.observeEncryptedEvents,
  sendEncryptedCommand: mocks.sendEncryptedCommand,
}));

vi.mock("./replay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./replay")>()),
  loadEncryptedTurn: mocks.loadEncryptedTurn,
}));

describe("useE2EESessionRuntime", () => {
  afterEach(() => cleanup());
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
    mocks.loadEncryptedTurn.mockResolvedValue({
      headCursor: 0,
      replayEvents: [],
      turnRef: "turn",
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

  it("isolates replay requests and cancellation when switching sessions", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useE2EESessionRuntime({
          agentId: "agent_1",
          enabled: true,
          sessionId,
          userId: "user_1",
        }),
      { wrapper, initialProps: { sessionId: "first" } },
    );
    await waitFor(() => expect(result.current.rootKeyAvailable).toBe(true));
    await waitFor(() => expect(mocks.loadEncryptedTurn).toHaveBeenCalled());
    const first = mocks.loadEncryptedTurn.mock.calls.find(
      ([options]) => options.sessionId === "first",
    )?.[0];
    expect(first.beforeId).toBe(0);
    expect(first.signal).toBeInstanceOf(AbortSignal);
    rerender({ sessionId: "second" });
    await waitFor(() =>
      expect(
        mocks.loadEncryptedTurn.mock.calls.some(
          ([options]) => options.sessionId === "second",
        ),
      ).toBe(true),
    );
    const second = mocks.loadEncryptedTurn.mock.calls.find(
      ([options]) => options.sessionId === "second",
    )?.[0];
    expect(second.beforeId).toBe(0);
    expect(second.signal).not.toBe(first.signal);
  });

  it("given replay in progress then waits for its head before following live frames", async () => {
    let complete!: (value: unknown) => void;
    mocks.loadEncryptedTurn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent",
          sessionId: "session",
          userId: "user",
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(complete).toBeDefined());
    expect(mocks.observeEncryptedEvents).not.toHaveBeenCalled();
    await act(async () =>
      complete({
        messages: [],
        replayEvents: [],
        headCursor: 123,
        turnRef: "turn",
        pagination: { has_more: false, next_before_id: 0 },
      }),
    );
    await waitFor(() =>
      expect(mocks.observeEncryptedEvents).toHaveBeenCalled(),
    );
    expect(mocks.observeEncryptedEvents.mock.calls[0][0].afterCursor).toBe(123);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(mocks.loadEncryptedTurn).toHaveBeenCalledTimes(1);
    unmount();
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

  it("sends attachment-only encrypted prompts and restores files after a download failure", async () => {
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
    const file = new File(["private"], "private.txt");
    const attachment = {
      attachmentId: "local_1",
      filename: file.name,
      encryptedFile: file,
    };
    const descriptor = {
      version: 1,
      object_id: "att_cipher",
      download_url: "https://storage.test/cipher",
    };
    mocks.uploadEncryptedAttachment.mockResolvedValue(descriptor);
    await act(async () => {
      await result.current.sendMessage("", [attachment]);
    });
    expect(mocks.uploadEncryptedAttachment).toHaveBeenCalledWith(
      file,
      expect.any(Uint8Array),
      { agent_id: "agent_1", session_id: "session_1", key_epoch: 1 },
      "user_1",
      expect.any(AbortSignal),
      expect.any(Function),
    );
    const command = mocks.sendEncryptedCommand.mock.calls[0][0];
    expect(command.frame.params).toMatchObject({
      prompt: [],
      paxEncryptedAttachments: [descriptor],
    });
    await act(async () => {
      await observerOptions?.onFrame(
        {
          jsonrpc: "2.0",
          id: command.frame.id,
          error: {
            code: -32000,
            message: "encrypted attachment authentication failed",
          },
        },
        {},
      );
    });
    expect(result.current.status).toBe("error");
    expect(result.current.failedAttachments).toEqual([attachment]);
    mocks.sendEncryptedCommand.mockImplementationOnce(async ({ frame }) => {
      await observerOptions?.onFrame(
        {
          jsonrpc: "2.0",
          id: frame.id,
          error: {
            code: -32000,
            message: "download rejected before POST returned",
          },
        },
        {},
      );
      return { command_id: "cmd_2", created: true, status: "pending" };
    });
    await act(async () => {
      await expect(
        result.current.sendMessage("retry", [attachment]),
      ).rejects.toThrow("download rejected before POST returned");
    });
  });

  it("does not send a prompt if attachment encryption or upload fails", async () => {
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
    mocks.uploadEncryptedAttachment.mockRejectedValue(
      new Error("upload failed"),
    );
    await act(async () => {
      await expect(
        result.current.sendMessage("private", [
          {
            attachmentId: "local",
            filename: "private.txt",
            encryptedFile: new File(["private"], "private.txt"),
          },
        ]),
      ).rejects.toThrow("upload failed");
    });
    expect(mocks.sendEncryptedCommand).not.toHaveBeenCalled();
    expect(result.current.uploadProgress).toBeNull();
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
  it("waits for the replay boundary before posting session/new so its response cannot be skipped", async () => {
    let finishReplay!: (value: unknown) => void;
    mocks.loadEncryptedTurn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReplay = resolve;
        }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useE2EESessionRuntime({
          agentId: "agent",
          sessionId: "session",
          userId: "user",
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(finishReplay).toBeDefined());
    let started!: Promise<void>;
    const sendFirstPrompt = result.current.sendMessage;
    act(() => {
      started = result.current.startSession("/tmp");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.sendEncryptedCommand).not.toHaveBeenCalled();
    await act(async () => {
      finishReplay({
        headCursor: 123,
        replayEvents: [],
        turnRef: "turn",
        messages: [],
        pagination: { has_more: false, next_before_id: 0 },
      });
    });
    await waitFor(() =>
      expect(mocks.sendEncryptedCommand).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(observerOptions).toBeDefined());
    const requestId = mocks.sendEncryptedCommand.mock.calls[0][0].frame.id;
    await act(async () => {
      await observerOptions!.onFrame(
        { id: requestId, result: { sessionId: "native" } },
        {},
      );
      await started;
    });
    expect(result.current.status).toBe("done");
    await act(async () => {
      await sendFirstPrompt("first prompt");
    });
    expect(mocks.loadEncryptedTurn).toHaveBeenCalledTimes(1);
  });
  it("retains the prompt through 510 tool events and a batched completion", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
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
      await result.current.sendMessage("Keep this prompt");
    });
    const requestId =
      mocks.sendEncryptedCommand.mock.calls.at(-1)?.[0].frame.id;
    await act(async () => {
      for (let i = 0; i < 510; i++) {
        void observerOptions?.onFrame(
          {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "native_1",
              update: {
                sessionUpdate: "tool_call",
                toolCallId: `tool_${i}`,
                title: "Read",
              },
            },
          },
          { turnId: "turn_long" },
        );
      }
      void observerOptions?.onFrame(
        { jsonrpc: "2.0", id: requestId, result: { stopReason: "end_turn" } },
        { turnId: "turn_long" },
      );
    });
    expect(result.current.events[0]).toMatchObject({
      type: "user_message",
      content: "Keep this prompt",
      turnId: "turn_long",
    });
    expect(
      result.current.events.filter((event) => event.type === "tool_call"),
    ).toHaveLength(510);
    expect(
      result.current.events.every((event) => event.sessionId === "session_1"),
    ).toBe(true);
    await act(async () => {
      await result.current.historyQuery.refetch();
    });
    expect(result.current.events[0]).toMatchObject({
      type: "user_message",
      turnId: "turn_long",
    });
    unmount();
    queryClient.clear();
  });
});
