/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkstreamItem } from "@/features/runtime/session-events";
import { WorkstreamItemCard } from "./session-event-cards";

const permissionDecision = {
  decisions: {},
  error: null,
  onDecision: vi.fn(),
  pending: false,
};

function thoughtItem(grouped: boolean, complete: boolean): WorkstreamItem {
  const event = {
    type: "progress" as const,
    id: "thought-model",
    sessionId: "session-model",
    content: "Checking the current model",
    createdAt: "2026-11-13T20:00:00Z",
    streaming: !complete,
  };
  return grouped
    ? {
        type: "work_group",
        id: "group-model",
        sessionId: event.sessionId,
        createdAt: event.createdAt,
        completedAt: complete ? "2026-11-13T20:00:01Z" : undefined,
        complete,
        events: [event],
      }
    : { type: "event", id: event.id, event };
}

function card(item: WorkstreamItem, showWhaleAvatar?: boolean) {
  return (
    <TooltipProvider>
      <WorkstreamItemCard
        item={item}
        permissionDecision={permissionDecision}
        showWhaleAvatar={showWhaleAvatar}
      />
    </TooltipProvider>
  );
}

afterEach(cleanup);

describe("Given thinking without a confirmed DeepSeek model", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])("hides the whale for grouped=%s complete=%s", (grouped, complete) => {
    const { container } = render(card(thoughtItem(grouped, complete)));
    expect(
      container.querySelector('[data-slot="thinking-avatar"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        complete
          ? grouped
            ? "Thought for 1s"
            : "Thought"
          : grouped
            ? "Thinking…"
            : "Thinking",
      ),
    ).toBeVisible();
  });

  it.each([false, true])(
    "updates the same grouped=%s timeline item when the confirmed model changes",
    (grouped) => {
      const item = thoughtItem(grouped, false);
      const view = render(card(item, true));
      expect(
        view.container.querySelector('[data-slot="thinking-avatar"]'),
      ).toHaveClass("animate-spin");

      view.rerender(card(item, false));
      expect(
        view.container.querySelector('[data-slot="thinking-avatar"]'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(grouped ? "Thinking…" : "Thinking"),
      ).toBeVisible();

      view.rerender(card(item, true));
      expect(
        view.container.querySelector('[data-slot="thinking-avatar"]'),
      ).toHaveClass("animate-spin");
    },
  );

  it("keeps completed timing and a single disclosure arrow when the avatar is hidden", () => {
    const item = thoughtItem(true, true);
    const view = render(card(item, true));
    expect(
      view.container.querySelector('[data-slot="thinking-avatar"]'),
    ).not.toHaveClass("animate-spin");
    view.rerender(card(item, false));
    expect(screen.getByText("Thought for 1s")).toBeVisible();
    expect(
      view.container.querySelector('[data-slot="thinking-avatar"]'),
    ).not.toBeInTheDocument();
    expect(
      view.container.querySelectorAll("summary .lucide-chevron-down"),
    ).toHaveLength(1);
  });
});
