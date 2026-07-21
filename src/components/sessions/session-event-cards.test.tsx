/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("collapses a work group containing thoughts and tool calls", () => {
    const thought: Extract<SessionEvent, { type: "progress" }> = {
      type: "progress",
      id: "thought-1",
      sessionId: "sess-1",
      content: "Checking the relevant files",
      streaming: true,
      createdAt: "2026-07-17T19:59:59Z",
    };
    const runningTool: Extract<SessionEvent, { type: "tool_call" }> = {
      type: "tool_call",
      id: "tool-event-1",
      sessionId: "sess-1",
      name: "shell",
      status: "running",
      input: { command: "pnpm test" },
      permissions: [
        {
          type: "permission_request",
          id: "permission-1",
          sessionId: "sess-1",
          requestId: "permission-1",
          title: "Run pnpm test",
          options: [],
          createdAt: "2026-07-17T20:00:00Z",
        },
      ],
      createdAt: "2026-07-17T20:00:00Z",
    };
    const { container } = renderItem({
      type: "work_group",
      id: "work-group-1",
      sessionId: "sess-1",
      createdAt: thought.createdAt,
      complete: false,
      events: [thought, runningTool],
    });

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector("details")).toHaveClass("py-0");
    expect(screen.getByText("工作中")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("次思考");
    expect(container).not.toHaveTextContent("个工具调用");
    expect(
      container.querySelector(":scope > details > summary"),
    ).toHaveTextContent("1 approval");
    expect(screen.queryByText(thought.content)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("shell · pnpm test");
    expect(screen.queryByText("1 running")).not.toBeInTheDocument();

    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.queryByText(thought.content)).not.toBeInTheDocument();
    expect(screen.getByText("shell · pnpm test")).toBeInTheDocument();
    expect(screen.getByText("1 running")).toBeInTheDocument();

    const thoughtDetails = container.querySelectorAll("details")[1];
    thoughtDetails.open = true;
    fireEvent(thoughtDetails, new Event("toggle"));
    expect(screen.getByText(thought.content)).toBeInTheDocument();
  });

  it("renders a standalone tool call without a work-process wrapper", () => {
    const completedTool: Extract<SessionEvent, { type: "tool_call" }> = {
      type: "tool_call",
      id: "tool-event-complete",
      sessionId: "sess-1",
      name: "read",
      status: "done",
      createdAt: "2026-07-17T20:00:00Z",
    };
    const { container } = renderItem({
      type: "event",
      id: completedTool.id,
      event: completedTool,
    });

    expect(container).toHaveTextContent("工具调用");
    expect(container).toHaveTextContent("1");
    expect(container).not.toHaveTextContent("工作过程");
    expect(container).not.toHaveTextContent("工作中");
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
    expect(container).toHaveTextContent("思考中");
    expect(container).not.toHaveTextContent(thought.content);
    expect(container.querySelector(".lucide-chevron-down")).toHaveClass(
      "ml-auto",
    );
  });

  it("uses compact line height for normal agent messages", () => {
    const message: Extract<SessionEvent, { type: "agent_message" }> = {
      type: "agent_message",
      id: "message-1",
      sessionId: "sess-1",
      content:
        "## Summary\n\nFinished the requested work.\n\n> Supporting context.",
      createdAt: "2026-07-17T20:00:00Z",
    };
    const { container } = renderItem({
      type: "event",
      id: message.id,
      event: message,
    });

    expect(
      screen.getByText("Finished the requested work.").parentElement,
    ).toHaveClass("text-sm", "leading-5");
    expect(screen.getByRole("heading", { name: "Summary" })).toHaveClass(
      "text-base",
    );
    expect(container.querySelector("blockquote")).toHaveClass("text-[13px]");
    expect(container.querySelector("article")).toHaveClass("py-0");
  });

  it("portals the turn footer patch drawer outside the timeline item", () => {
    const { container } = renderItem({
      type: "turn_footer",
      id: "turn-footer-1",
      sessionId: "sess-1",
      createdAt: "2026-07-17T20:00:00Z",
      turnPatches: [
        {
          operation: "patch",
          path: "src/example.ts",
          oldText: "const value = 1;",
          newText: "const value = 2;",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    const drawer = screen.getByRole("complementary");
    expect(document.body).toContainElement(drawer);
    expect(container).not.toContainElement(drawer);
    expect(drawer).toHaveClass("overscroll-contain");
    expect(drawer.querySelector(".overflow-auto")).toHaveClass(
      "overscroll-contain",
    );
    expect(drawer).toHaveTextContent("src/example.ts");
  });
});
