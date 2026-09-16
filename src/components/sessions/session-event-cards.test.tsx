/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  WorkstreamItemCard,
  type PermissionDecisionState,
} from "./session-event-cards";
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

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function renderItem(
  item: WorkstreamItem,
  decision: PermissionDecisionState = permissionDecision,
) {
  return render(
    <TooltipProvider>
      <WorkstreamItemCard item={item} permissionDecision={decision} />
    </TooltipProvider>,
  );
}

describe("session event cards", () => {
  it("shows sent files inside the user message without composer removal controls", () => {
    renderItem({
      type: "event",
      id: "user_1",
      event: {
        type: "user_message",
        id: "user_1",
        sessionId: "sess_1",
        content: "See screenshot",
        createdAt: "2026-09-15T00:00:00Z",
        attachments: [
          {
            attachmentId: "att_1",
            filename: "Screenshot.png",
            contentType: "image/png",
          },
          {
            attachmentId: "att_2",
            filename: "notes.pdf",
            contentType: "application/pdf",
          },
        ],
      },
    });
    expect(screen.getByText("See screenshot")).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Message attachments" }),
    ).toBeVisible();
    expect(screen.getByText("Screenshot.png")).toBeVisible();
    expect(screen.getByText("notes.pdf")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument();
  });
  it("uses a saved manual decision instead of an inferred auto approval", () => {
    const event: Extract<SessionEvent, { type: "permission_request" }> = {
      type: "permission_request",
      id: "permission-1",
      requestId: "request-1",
      approvalId: "approval-1",
      sessionId: "sess-1",
      title: "Run command",
      options: [],
      createdAt: "2026-09-15T00:00:00Z",
      decision: {
        decisionOption: "auto_approved",
        source: "auto",
        status: "approved",
      },
    };
    renderItem(
      { type: "event", id: event.id, event },
      {
        ...permissionDecision,
        decisions: {
          "approval-1": {
            decisionOption: "allow_once",
            source: "user",
            status: "approved",
          },
        },
      },
    );
    expect(screen.getByText("approved by user")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Allow once" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deny" }),
    ).not.toBeInTheDocument();
  });

  it("allows the next permission while a previous decision is still streaming", () => {
    const event: Extract<SessionEvent, { type: "permission_request" }> = {
      type: "permission_request",
      id: "permission-2",
      requestId: "request-2",
      approvalId: "approval-2",
      sessionId: "sess-1",
      title: "Run next command",
      options: [],
      createdAt: "2026-09-13T00:00:00Z",
    };
    const onDecision = vi.fn();
    renderItem(
      { type: "event", id: event.id, event },
      {
        ...permissionDecision,
        pending: true,
        pendingApprovalId: "approval-1",
        onDecision,
        decisions: {
          "approval-1": {
            decisionOption: "allow_once",
            source: "user",
            status: "approved",
          },
        },
      },
    );
    const allow = screen.getByRole("button", { name: "Allow once" });
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "This agent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "This node" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "All agents" }),
    ).not.toBeInTheDocument();
    expect(allow).toBeEnabled();
    fireEvent.click(allow);
    expect(onDecision).toHaveBeenCalledWith("approval-2", "allow_once");
  });

  it("prevents duplicate decisions for the request currently being submitted", () => {
    const event: Extract<SessionEvent, { type: "permission_request" }> = {
      type: "permission_request",
      id: "permission-1",
      requestId: "request-1",
      approvalId: "approval-1",
      sessionId: "sess-1",
      title: "Run command",
      options: [],
      createdAt: "2026-09-13T00:00:00Z",
    };
    renderItem(
      { type: "event", id: event.id, event },
      {
        ...permissionDecision,
        pending: true,
        pendingApprovalId: "approval-1",
      },
    );
    expect(screen.getByRole("button", { name: "Allow once" })).toBeDisabled();
  });

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
    expect(screen.getByText("Working")).toBeInTheDocument();
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

    expect(container).toHaveTextContent("Tool calls");
    expect(container).toHaveTextContent("1");
    expect(container).not.toHaveTextContent("Work process");
    expect(container).not.toHaveTextContent("Working");
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
    expect(container).toHaveTextContent("Thinking");
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
    ).toHaveClass("text-base", "leading-6", "sm:text-sm", "sm:leading-5");
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

  it("shows turn usage details from a dashboard icon beside Done", () => {
    renderItem({
      type: "turn_footer",
      id: "turn-footer-usage",
      sessionId: "sess-1",
      createdAt: "2026-09-08T04:26:36Z",
      actionsContent: "Finished the requested work.",
      tokenUsage: {
        inputTokens: 5_056,
        cacheReadTokens: 11_264,
        outputTokens: 52,
        reasoningTokens: 0,
        totalTokens: 16_372,
      },
      contextUsage: {
        usedTokens: 16_372,
        windowTokens: 258_400,
      },
      contextCompaction: {
        beforeTokens: 221_801,
        afterTokens: 10_307,
        windowTokens: 258_400,
      },
    });

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("16.4k turn tokens")).not.toBeInTheDocument();
    expect(screen.queryByText("6.3% context")).not.toBeInTheDocument();
    expect(screen.queryByText("Compacted")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn usage details" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Turn tokens16,372");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Context16,372 / 258,400 (6.3%)",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Compacted221,801 → 10,307",
    );
    expect(
      screen.getByRole("button", { name: "Copy response" }),
    ).toBeInTheDocument();
  });
});
