/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocaleStore } from "@/features/i18n/locale-store";
import type {
  SessionEvent,
  ToolCallEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";
import { WorkstreamItemCard } from "./session-event-cards";

const permissionDecision = {
  decisions: {},
  error: null,
  onDecision: vi.fn(),
  pending: false,
};
const tool: ToolCallEvent = {
  type: "tool_call",
  id: "tool-fold",
  toolCallId: "native-tool-fold",
  sessionId: "sess-fold",
  name: "shell",
  status: "done",
  input: { command: "pwd" },
  output: "fixture workspace",
  createdAt: "2026-11-13T20:00:00Z",
};

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
});

async function mountTool(compact: boolean) {
  const select = vi.fn();
  const item: WorkstreamItem = compact
    ? {
        type: "work_group",
        id: "work-fold",
        sessionId: tool.sessionId,
        createdAt: tool.createdAt,
        complete: true,
        events: [tool],
      }
    : { type: "event", id: tool.id, event: tool };
  const { container } = render(
    <TooltipProvider>
      <WorkstreamItemCard
        item={item}
        onSelectToolEvidence={select}
        permissionDecision={permissionDecision}
      />
    </TooltipProvider>,
  );
  if (compact) fireEvent.click(container.querySelector("summary")!);
  const summary = (await screen.findByText("shell")).closest("summary")!;
  const details = summary.closest("details")!;
  const chevron = summary.lastElementChild!;
  return { select, summary, details, chevron };
}

describe("Given expanded tool evidence", () => {
  it.each([false, true])(
    "collapses the %s compact tool without reopening evidence, and can reopen it later",
    async (compact) => {
      const { select, details, chevron } = await mountTool(compact);
      fireEvent.click(chevron);
      await waitFor(() => expect(details.open).toBe(true));
      expect(select).toHaveBeenCalledExactlyOnceWith({
        type: "tool",
        event: tool,
      });

      // A new selection would reopen the side panel after the user has closed it.
      select.mockClear();
      fireEvent.click(chevron);
      await waitFor(() => expect(details.open).toBe(false));
      expect(select).not.toHaveBeenCalled();

      fireEvent.click(chevron);
      await waitFor(() => expect(details.open).toBe(true));
      expect(select).toHaveBeenCalledExactlyOnceWith({
        type: "tool",
        event: tool,
      });
    },
  );

  it("does not select evidence when a pending approval has already opened the native disclosure", () => {
    const event: ToolCallEvent = {
      ...tool,
      status: "queued",
      permissions: [
        {
          type: "permission_request",
          id: "approval-fold",
          requestId: "request-fold",
          approvalId: "approval-fold",
          sessionId: tool.sessionId,
          title: "Run pwd",
          options: [],
          createdAt: tool.createdAt,
        },
      ],
    };
    const select = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <WorkstreamItemCard
          item={{ type: "event", id: event.id, event }}
          onSelectToolEvidence={select}
          permissionDecision={permissionDecision}
        />
      </TooltipProvider>,
    );
    const summary = container.querySelector("summary")!;
    expect(summary.closest("details")).toHaveAttribute("open");
    fireEvent.click(summary.lastElementChild!);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("Given Chinese thought indicators", () => {
  const thought: Extract<SessionEvent, { type: "progress" }> = {
    type: "progress",
    id: "thought-copy",
    sessionId: tool.sessionId,
    content: "Original agent content",
    streaming: true,
    createdAt: tool.createdAt,
  };
  it.each([true, false])(
    "distinguishes active and finished Chinese thoughts with streaming=%s",
    (streaming) => {
      useLocaleStore.setState({ locale: "zh-CN" });
      render(
        <TooltipProvider>
          <WorkstreamItemCard
            item={{
              type: "event",
              id: thought.id,
              event: { ...thought, streaming },
            }}
            permissionDecision={permissionDecision}
          />
        </TooltipProvider>,
      );
      expect(
        screen.getByText(streaming ? "思考中..." : "已深度思考"),
      ).toBeVisible();
      expect(screen.queryByText("思考过程")).not.toBeInTheDocument();
    },
  );
  it.each([
    ["2026-11-13T20:00:01Z", "已深度思考1s"],
    ["2026-11-13T20:00:00.100Z", "已深度思考0.1s"],
    [undefined, "已深度思考"],
  ] as const)(
    "labels a completed thought with boundary %s as %s",
    async (completedAt, label) => {
      useLocaleStore.setState({ locale: "zh-CN" });
      const { container } = render(
        <TooltipProvider>
          <WorkstreamItemCard
            item={{
              type: "work_group",
              id: "completed-thinking",
              sessionId: tool.sessionId,
              createdAt: thought.createdAt,
              complete: true,
              completedAt,
              events: [thought],
            }}
            permissionDecision={permissionDecision}
          />
        </TooltipProvider>,
      );
      expect(screen.getByText(label)).toBeVisible();
      expect(
        container.querySelector('[data-slot="thinking-avatar"]'),
      ).not.toBeInTheDocument();
      fireEvent.click(container.querySelector("summary")!);
      await waitFor(() => expect(screen.getAllByText(label)).toHaveLength(2));
      expect(screen.queryByText("思考中...")).not.toBeInTheDocument();
    },
  );

  it("ends an earlier thought at the next tool rather than counting tool execution", async () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    const { container } = render(
      <TooltipProvider>
        <WorkstreamItemCard
          item={{
            type: "work_group",
            id: "thinking-then-tool",
            sessionId: tool.sessionId,
            createdAt: thought.createdAt,
            complete: true,
            completedAt: "2026-11-13T20:00:30Z",
            events: [thought, { ...tool, createdAt: "2026-11-13T20:00:01Z" }],
          }}
          permissionDecision={permissionDecision}
        />
      </TooltipProvider>,
    );
    fireEvent.click(container.querySelector("summary")!);
    expect(await screen.findByText("已深度思考1s")).toBeVisible();
    expect(screen.getByText("工作了 30s")).toBeVisible();
    expect(screen.queryByText("已深度思考30s")).not.toBeInTheDocument();
  });
  it("uses the same copy on the live activity row", () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    render(
      <TooltipProvider>
        <WorkstreamItemCard
          item={{
            type: "work_group",
            id: "thinking-group",
            sessionId: tool.sessionId,
            createdAt: tool.createdAt,
            complete: false,
            events: [thought],
          }}
          permissionDecision={permissionDecision}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("思考中...")).toBeVisible();
  });
});
