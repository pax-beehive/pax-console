/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkstreamItemCard } from "./session-event-cards";
import type {
  SessionEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";

const permissionDecision = {
  decisions: {},
  error: null,
  onDecision: vi.fn(),
  pending: false,
};

function renderItem(item: WorkstreamItem) {
  return render(
    <TooltipProvider>
      <WorkstreamItemCard item={item} permissionDecision={permissionDecision} />
    </TooltipProvider>,
  );
}

describe("session event cards", () => {
  it("collapses a tool group and exposes the running tool preview", () => {
    const runningTool: Extract<SessionEvent, { type: "tool_call" }> = {
      type: "tool_call",
      id: "tool-event-1",
      sessionId: "sess-1",
      name: "shell",
      status: "running",
      input: { command: "pnpm test" },
      createdAt: "2026-07-17T20:00:00Z",
    };
    const { container } = renderItem({
      type: "tool_group",
      id: "tool-group-1",
      sessionId: "sess-1",
      createdAt: runningTool.createdAt,
      events: [runningTool],
    });

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("shell · pnpm test")).toBeInTheDocument();
    expect(screen.getByText("1 running")).toBeInTheDocument();
  });

  it("collapses thought content by default", () => {
    const thought: Extract<SessionEvent, { type: "progress" }> = {
      type: "progress",
      id: "thought-1",
      sessionId: "sess-1",
      content: "Checking the relevant files",
      streaming: true,
      createdAt: "2026-07-17T20:00:00Z",
    };
    const { container } = renderItem({
      type: "event",
      id: thought.id,
      event: thought,
    });

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("uses compact line height for normal agent messages", () => {
    const message: Extract<SessionEvent, { type: "agent_message" }> = {
      type: "agent_message",
      id: "message-1",
      sessionId: "sess-1",
      content: "Finished the requested work.",
      createdAt: "2026-07-17T20:00:00Z",
    };
    renderItem({ type: "event", id: message.id, event: message });

    expect(screen.getByText(message.content).parentElement).toHaveClass(
      "leading-7",
    );
  });
});
