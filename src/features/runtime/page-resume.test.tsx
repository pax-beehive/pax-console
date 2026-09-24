/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionObserver } from "./session-observer";
import { usePageResume } from "./use-page-resume";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("page resume", () => {
  it("refreshes status from a replayed terminal marker before the observer stream closes", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                stream = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      ),
    );
    const onTurnEnd = vi.fn();
    const onTurnDone = vi.fn();
    const { unmount } = renderHook(() =>
      useSessionObserver({
        userId: "self",
        agentId: "agent",
        sessionId: "session",
        turnId: "current",
        onTurnEnd,
        onTurnDone,
      }),
    );
    await waitFor(() => expect(stream).toBeDefined());
    const emit = (turn: string) =>
      stream.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({
            type: "history_item",
            session_id: "session",
            turn_id: turn,
            item: {
              message_id: `end-${turn}`,
              session_id: "session",
              turn_id: turn,
              message_type: "turn_done",
              session_seq: 1,
              parts: [],
            },
          })}\n\n`,
        ),
      );
    await act(async () => emit("previous"));
    expect(onTurnEnd).not.toHaveBeenCalled();
    await act(async () => emit("current"));
    expect(onTurnEnd).toHaveBeenCalledWith("current");
    expect(onTurnDone).not.toHaveBeenCalled();
    unmount();
    stream.close();
  });

  it("refreshes immediately on window refocus with the latest callback and removes listeners", () => {
    const first = vi.fn();
    const latest = vi.fn();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { rerender, unmount } = renderHook(
      ({ callback }) => usePageResume(callback, { includeWindowFocus: true }),
      { initialProps: { callback: first } },
    );
    window.dispatchEvent(new Event("blur"));
    rerender({ callback: latest });
    window.dispatchEvent(new Event("focus"));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    expect(latest).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(latest).toHaveBeenCalledTimes(2);
    unmount();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it("coalesces visibility resume and focus without refreshing while hidden", () => {
    const refresh = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const { unmount } = renderHook(() =>
      usePageResume(refresh, { includeWindowFocus: true }),
    );
    window.dispatchEvent(new Event("blur"));
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    // Some browsers deliver focus before visibilitychange on return.
    window.dispatchEvent(new Event("blur"));
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("leaves window refocus recovery opt-in for stream and history consumers", () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => usePageResume(refresh));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it("refreshes only on resume and uses the latest callback", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const { rerender, unmount } = renderHook(
      ({ callback }) => usePageResume(callback),
      {
        initialProps: { callback: first },
      },
    );
    document.dispatchEvent(new Event("visibilitychange"));
    expect(first).not.toHaveBeenCalled();
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    rerender({ callback: latest });
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(latest).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(latest).toHaveBeenCalledTimes(2);
    unmount();
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it("reopens a silently stalled observer and keeps its snapshot until the new head", async () => {
    const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streams.push(controller);
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const { result, unmount } = renderHook(() =>
      useSessionObserver({
        userId: "self",
        agentId: "agent",
        sessionId: "session",
        turnId: "turn",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const emit = (index: number, value: unknown) =>
      streams[index].enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`),
      );
    const snapshot = (index: number, text: string) => {
      emit(index, {
        type: "turn_start",
        session_id: "session",
        turn_id: "turn",
      });
      emit(index, {
        type: "history_item",
        session_id: "session",
        turn_id: "turn",
        item: {
          message_id: "message",
          session_id: "session",
          turn_id: "turn",
          session_seq: 1,
          message_type: "user_message",
          role: "user",
          created_at: "2026-09-17T00:00:00Z",
          parts: [{ part_index: 0, part_type: "text", text }],
        },
      });
    };
    const head = (index: number) =>
      emit(index, {
        type: "head",
        session_id: "session",
        turn_id: "turn",
        head_seq: 1,
      });
    await act(async () => {
      snapshot(0, "Before suspension");
      head(0);
    });
    await waitFor(() =>
      expect(result.current.snapshotTurnIds).toEqual(["turn"]),
    );
    const previous = result.current.events;
    expect(previous.length).toBeGreaterThan(0);
    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      snapshot(1, "Restored snapshot");
    });
    expect(result.current.events).toEqual(previous);
    await act(async () => {
      head(1);
    });
    await waitFor(() =>
      expect(result.current.events).toContainEqual(
        expect.objectContaining({ content: "Restored snapshot" }),
      ),
    );
    unmount();
    streams.forEach((stream) => stream.close());
  });
});
