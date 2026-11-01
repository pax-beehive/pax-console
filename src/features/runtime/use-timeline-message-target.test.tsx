/* @vitest-environment jsdom */

import { createRef } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMessageTarget,
  useTimelineMessageTarget,
} from "./use-timeline-message-target";
import type { WorkstreamItem } from "./session-events";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Exact message scrolling", () => {
  it("scrolls and focuses only the exact canonical target once, and highlights temporarily", () => {
    vi.useFakeTimers();
    const scrollRef = createRef<HTMLDivElement>();
    const container = document.createElement("div");
    scrollRef.current = container;
    container.scrollTop = 100;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      top: 10,
    } as DOMRect);
    const wrong = document.createElement("div");
    wrong.dataset.targetMessageId = 'msg:1["suffix';
    const row = document.createElement("div");
    const messageId = 'msg:1["';
    row.dataset.targetMessageId = messageId;
    row.tabIndex = -1;
    container.append(wrong, row);
    document.body.append(container);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      top: 350,
    } as DOMRect);
    const onLocate = vi.fn();
    const items: WorkstreamItem[] = [];
    const { rerender, unmount } = renderHook(() =>
      useTimelineMessageTarget({
        scrollRef,
        messageId,
        ready: true,
        items,
        onLocate,
      }),
    );
    expect(container.scrollTop).toBe(416);
    expect(document.activeElement).toBe(row);
    expect(row.dataset.messageHighlighted).toBe("true");
    expect(wrong.dataset.messageHighlighted).toBeUndefined();
    rerender();
    expect(onLocate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(row.dataset.messageHighlighted).toBeUndefined();
    unmount();
    container.remove();
  });

  it("does not match a prefix or a footer and waits until the target has rendered", () => {
    const event = {
      type: "agent_message",
      id: "derived-frame-id",
      sessionId: "pax",
      content: "same text",
      createdAt: "",
      historyMessageId: "canonical",
    } as const;
    expect(
      isMessageTarget({ type: "event", id: event.id, event }, "canonical"),
    ).toBe(true);
    expect(
      isMessageTarget({ type: "event", id: event.id, event }, "canon"),
    ).toBe(false);
    const scrollRef = createRef<HTMLDivElement>();
    scrollRef.current = document.createElement("div");
    const onLocate = vi.fn();
    const { rerender } = renderHook(
      ({ ready }) =>
        useTimelineMessageTarget({
          scrollRef,
          messageId: "canonical",
          ready,
          items: [],
          onLocate,
        }),
      { initialProps: { ready: false } },
    );
    const row = document.createElement("div");
    row.dataset.targetMessageId = "canonical";
    scrollRef.current.append(row);
    expect(onLocate).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(onLocate).toHaveBeenCalledTimes(1);
  });
});
