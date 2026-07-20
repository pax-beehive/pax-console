/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "./session-events";
import {
  appendSessionEvents,
  useBufferedSessionEvents,
} from "./use-buffered-session-events";

afterEach(() => {
  vi.useRealTimers();
});

describe("appendSessionEvents", () => {
  it("keeps one compact event per streaming segment across flushes", () => {
    const firstChunk = textChunk("A");
    const tool: SessionEvent = {
      type: "tool_call",
      id: "tool_1",
      sessionId: "sess_1",
      name: "read",
      status: "done",
      createdAt: "2026-07-18T00:00:01.000Z",
    };

    let events = appendSessionEvents([], [firstChunk]);
    events = appendSessionEvents(events, [tool]);
    events = appendSessionEvents(events, [textChunk("B")]);
    events = appendSessionEvents(events, [textChunk("C")]);

    expect(events).toHaveLength(3);
    expect(events).toMatchObject([
      { type: "agent_message", id: "stream_1", content: "A" },
      { type: "tool_call", id: "tool_1" },
      {
        type: "agent_message",
        id: "stream_1:segment:1",
        content: "BC",
      },
    ]);
  });

  it("commits many frames once per 40ms window", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBufferedSessionEvents());

    act(() => {
      result.current.append([textChunk("A")]);
      result.current.append([textChunk("B")]);
      result.current.append([textChunk("C")]);
    });
    expect(result.current.events).toEqual([]);

    act(() => vi.advanceTimersByTime(39));
    expect(result.current.events).toEqual([]);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.events).toMatchObject([
      { type: "agent_message", content: "ABC" },
    ]);
  });
});

function textChunk(content: string): SessionEvent {
  return {
    type: "agent_message",
    id: "stream_1",
    sessionId: "sess_1",
    content,
    streaming: true,
    sessionUpdate: "agent_message_chunk",
    createdAt: "2026-07-18T00:00:00.000Z",
  };
}
