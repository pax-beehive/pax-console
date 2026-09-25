/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function mockMessageHeight(height: number) {
  const getComputedStyle = window.getComputedStyle;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
    height,
  );
  return vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = getComputedStyle(element);
    style.lineHeight = "20px";
    return style;
  });
}

describe("session event cards", () => {
  it("lets the user expand and collapse a message taller than three rendered lines", async () => {
    mockMessageHeight(100);
    renderItem({
      type: "event",
      id: "long-user",
      event: {
        type: "user_message",
        id: "long-user",
        sessionId: "sess_1",
        content: "A long prompt that wraps across several lines at this width.",
        createdAt: "2026-09-17T00:00:00Z",
        attachments: [
          {
            attachmentId: "att_1",
            filename: "notes.pdf",
            contentType: "application/pdf",
          },
        ],
      },
    });

    const expand = await screen.findByRole("button", {
      name: "Click to expand",
    });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(
      document.getElementById(expand.getAttribute("aria-controls")!),
    ).toHaveTextContent("A long prompt");
    expect(screen.getByText("notes.pdf")).toBeVisible();

    fireEvent.click(expand);
    const collapse = screen.getByRole("button", { name: "Click to collapse" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(
      screen.getByRole("button", { name: "Click to expand" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show an expand action for a message that fits in three lines", async () => {
    const measure = mockMessageHeight(60);
    renderItem({
      type: "event",
      id: "short-user",
      event: {
        type: "user_message",
        id: "short-user",
        sessionId: "sess_1",
        content: "Short prompt",
        createdAt: "2026-09-17T00:00:00Z",
      },
    });

    await waitFor(() => expect(measure).toHaveBeenCalled());
    expect(screen.getByText("Short prompt")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Click to (expand|collapse)/ }),
    ).not.toBeInTheDocument();
  });

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
  it("connects images from the same message to one preview gallery", () => {
    render(
      <TooltipProvider>
        <WorkstreamItemCard
          userId="user_1"
          permissionDecision={permissionDecision}
          item={{
            type: "event",
            id: "gallery-message",
            event: {
              type: "user_message",
              id: "gallery-message",
              sessionId: "s",
              content: "Compare these",
              createdAt: "2026-09-25T00:00:00Z",
              attachments: [
                {
                  attachmentId: "one",
                  filename: "One.png",
                  contentType: "image/png",
                },
                {
                  attachmentId: "two",
                  filename: "Two.png",
                  contentType: "image/png",
                },
              ],
            },
          }}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview One.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog", { name: "Two.png" })).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Image position" }),
    ).toHaveTextContent("2 / 2");
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

  it("shows the current operation and opens a flat activity list", () => {
    const { container } = renderItem(activityGroup(false));
    expect(screen.getByText("Running shell")).toBeVisible();
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking files")).not.toBeInTheDocument();
    const group = container.querySelector("details")!;
    group.open = true;
    fireEvent(group, new Event("toggle"));
    expect(screen.getByText("shell")).toBeVisible();
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(3);
  });

  it("keeps an actionable approval outside the collapsed activity list without duplicating it", () => {
    const item = activityGroup(false);
    const tool = item.events[1] as Extract<SessionEvent, { type: "tool_call" }>;
    tool.permissions = [
      {
        type: "permission_request",
        id: "permission-1",
        requestId: "request-1",
        approvalId: "approval-1",
        sessionId: "sess-1",
        title: "Install dependencies",
        options: [],
        createdAt: tool.createdAt,
      },
    ];
    const onDecision = vi.fn();
    const { container } = renderItem(item, {
      ...permissionDecision,
      onDecision,
    });
    expect(screen.getByText("Waiting for approval")).toBeVisible();
    expect(screen.getByRole("button", { name: "Allow once" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onDecision).toHaveBeenCalledWith("approval-1", "allow_once");
    const group = container.querySelector("details")!;
    group.open = true;
    fireEvent(group, new Event("toggle"));
    expect(screen.getAllByRole("button", { name: "Allow once" })).toHaveLength(
      1,
    );
  });

  it("does not escalate a failed tool or ask the user to retry while the agent continues", () => {
    const item = activityGroup(false);
    (item.events[1] as Extract<SessionEvent, { type: "tool_call" }>).status =
      "error";
    const { container } = renderItem(item);
    expect(screen.getByText("Agent is working")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("error")).not.toBeInTheDocument();
    const group = container.querySelector("details")!;
    group.open = true;
    fireEvent(group, new Event("toggle"));
    expect(screen.getByText("error")).toBeVisible();
  });

  it("summarizes completed operations without counting thought chunks as operations", () => {
    const item = activityGroup(true);
    const { container } = renderItem(item);
    expect(screen.getByText("Finished 1 operation")).toBeVisible();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("shows elapsed time from the real completed activity boundary", () => {
    renderItem({ ...activityGroup(true), completedAt: "2026-09-25T00:00:24Z" });
    expect(screen.getByText("24s")).toBeVisible();
  });

  it("does not invent elapsed time for activity without a valid boundary", () => {
    renderItem({ ...activityGroup(true), completedAt: "invalid" });
    expect(screen.queryByText(/\d+s$/)).not.toBeInTheDocument();
  });

  it("shows a new running operation after a failed attempt without reporting the session as failed", () => {
    const item = activityGroup(false);
    const tool = item.events[1] as Extract<SessionEvent, { type: "tool_call" }>;
    tool.status = "error";
    item.events.push({
      ...tool,
      id: "retry",
      name: "Read upload handler",
      status: "running",
    });
    renderItem(item);
    expect(screen.getByText("Running Read upload handler")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a standalone tool directly without a Tool calls group", () => {
    const tool = activityGroup(true).events[1];
    const { container } = renderItem({
      type: "event",
      id: tool.id,
      event: tool,
    });
    expect(screen.getByText("shell")).toBeVisible();
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
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

function activityGroup(
  complete: boolean,
): Extract<WorkstreamItem, { type: "work_group" }> {
  return {
    type: "work_group",
    id: "activity-1",
    sessionId: "sess-1",
    createdAt: "2026-09-25T00:00:00Z",
    complete,
    events: [
      {
        type: "progress",
        id: "thought-1",
        sessionId: "sess-1",
        content: "Checking files",
        streaming: true,
        createdAt: "2026-09-25T00:00:00Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess-1",
        name: "shell",
        status: complete ? "done" : "running",
        input: { command: "pnpm test" },
        createdAt: "2026-09-25T00:00:01Z",
      },
    ],
  };
}
