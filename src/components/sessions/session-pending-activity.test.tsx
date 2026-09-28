/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkstreamItem } from "@/features/runtime/session-events";
import { SessionPendingActivity } from "./session-pending-activity";

const reply = (content: string): WorkstreamItem => ({
  type: "event",
  id: "reply",
  event: {
    type: "agent_message",
    id: "reply",
    sessionId: "s",
    turnId: "t",
    content,
    createdAt: "2026-09-28T00:00:00Z",
  },
});
const waiting = () =>
  screen.queryByRole("status", { name: "Waiting for agent" });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("session output gap feedback", () => {
  it("acknowledges the send immediately, hides during text deltas, and returns only after 1.5s of silence", () => {
    const { rerender } = render(
      <SessionPendingActivity status="streaming" items={[]} scopeKey="s:t" />,
    );
    expect(waiting()).toBeVisible();
    for (const content of ["H", "He", "Hello"]) {
      rerender(
        <SessionPendingActivity
          status="streaming"
          items={[reply(content)]}
          scopeKey="s:t"
        />,
      );
      expect(waiting()).not.toBeInTheDocument();
      advance(1000);
      expect(waiting()).not.toBeInTheDocument();
    }
    advance(499);
    expect(waiting()).not.toBeInTheDocument();
    advance(1);
    expect(waiting()).toBeVisible();
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello again")]}
        scopeKey="s:t"
      />,
    );
    expect(waiting()).not.toBeInTheDocument();
  });
  it("does not reset on identical history snapshots and resets between sessions/turns", () => {
    const { rerender } = render(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="s:t"
      />,
    );
    advance(1000);
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="s:t"
      />,
    );
    advance(500);
    expect(waiting()).toBeVisible();
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="s:t2"
      />,
    );
    expect(waiting()).not.toBeInTheDocument();
    advance(1500);
    expect(waiting()).toBeVisible();
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="other:t2"
      />,
    );
    expect(waiting()).not.toBeInTheDocument();
  });
  it.each([
    "done",
    "idle",
    "error",
    "cancelled",
    "waiting_approval",
    "unknown",
  ] as const)("cancels feedback immediately on %s", (status) => {
    const { rerender } = render(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="s:t"
      />,
    );
    advance(1500);
    expect(waiting()).toBeVisible();
    rerender(
      <SessionPendingActivity
        status={status}
        items={[reply("Hello")]}
        scopeKey="s:t"
      />,
    );
    expect(waiting()).not.toBeInTheDocument();
    advance(2000);
    expect(waiting()).not.toBeInTheDocument();
  });
  it("does not duplicate tool/thought activity and clears its timer on unmount", () => {
    const group: WorkstreamItem = {
      type: "work_group",
      id: "work",
      sessionId: "s",
      createdAt: "",
      complete: false,
      events: [],
    };
    const { rerender, unmount } = render(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello")]}
        scopeKey="s:t"
      />,
    );
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello"), group]}
        scopeKey="s:t"
      />,
    );
    advance(2000);
    expect(waiting()).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    rerender(
      <SessionPendingActivity
        status="streaming"
        items={[reply("Hello"), { ...group, complete: true }]}
        scopeKey="s:t"
      />,
    );
    advance(1500);
    expect(waiting()).toBeVisible();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
