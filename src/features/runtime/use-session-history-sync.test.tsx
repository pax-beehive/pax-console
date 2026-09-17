/* @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useSessionHistorySync } from "./use-session-history-sync";
import type { AgentSession, HistoryMessage } from "../api/types";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../api/resources", () => ({ listSessionHistory: mocks.read }));
afterEach(() => {
  vi.restoreAllMocks();
  mocks.read.mockReset();
});

it("recovers a turn completed while another browser tab was open, retaining content across a failed read", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const prompt: HistoryMessage = {
    message_id: "prompt",
    session_id: "s",
    turn_id: "t",
    session_seq: 1,
  };
  const reply: HistoryMessage = {
    message_id: "reply",
    session_id: "s",
    turn_id: "t",
    session_seq: 2,
  };
  const done: HistoryMessage = {
    message_id: "done",
    session_id: "s",
    turn_id: "t",
    session_seq: 3,
    message_type: "turn_done",
  };
  const running: AgentSession = {
    session_id: "s",
    node_id: "n",
    agent_id: "a",
    runtime_status: "running",
  };
  mocks.read.mockResolvedValueOnce({ messages: [prompt] });
  const { result, rerender, unmount } = renderHook(
    ({ session, version }) =>
      useSessionHistorySync({
        userId: "self",
        sessionId: "s",
        session,
        history: [prompt],
        metadataVersion: version,
      }),
    { wrapper, initialProps: { session: running, version: 1 } },
  );
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  const idle: AgentSession = {
    ...running,
    runtime_status: "idle",
    latest_turn_id: "t",
    latest_message_id: "done",
  };
  mocks.read
    .mockResolvedValueOnce({ messages: [reply, done] })
    .mockRejectedValueOnce(new Error("offline"));
  rerender({ session: idle, version: 2 });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.messages).toEqual([prompt]);
  expect(result.current.calibratedTurnIds).toEqual([]);
  mocks.read
    .mockResolvedValueOnce({ messages: [reply, done] })
    .mockResolvedValueOnce({ messages: [prompt, reply, done] });
  rerender({ session: idle, version: 3 });
  await waitFor(() => expect(result.current.calibratedTurnIds).toEqual(["t"]));
  expect(result.current.messages).toEqual([prompt, reply, done]);
  const calls = mocks.read.mock.calls.length;
  rerender({ session: idle, version: 4 });
  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.read).toHaveBeenCalledTimes(calls);
  unmount();
  client.clear();
});
