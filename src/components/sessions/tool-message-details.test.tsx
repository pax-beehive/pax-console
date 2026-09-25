/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiFetch } from "@/features/api/client";
import { WorkstreamItemCard } from "./session-event-cards";
import { ToolMessageDetails } from "./tool-message-details";
import type { ToolCallEvent } from "@/features/runtime/session-events";

vi.mock("@/features/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/client")>()),
  apiFetch: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const tool: ToolCallEvent = {
  type: "tool_call",
  id: "tool",
  sessionId: "session",
  name: "Run tests",
  status: "done",
  createdAt: "2026-09-16T00:00:00Z",
  historyDetails: [{ messageId: "message", updatedAt: "revision-key" }],
};
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
function mockDetails() {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    const input = path.includes("section=input");
    const more = !input && path.includes("offset=0");
    return {
      message_id: "message",
      section: input ? "input" : "output",
      format: input ? "json" : "text",
      text: input ? "null" : more ? "first page" : "second page",
      revision: "v1",
      next_offset: more ? 10 : 21,
      has_more: more,
    };
  });
}
describe("tool details", () => {
  it("does not fetch collapsed tools and loads more only on request", async () => {
    mockDetails();
    render(
      <WorkstreamItemCard
        userId="user"
        item={{ type: "event", id: "tool", event: tool }}
        permissionDecision={{
          decisions: {},
          error: null,
          onDecision: vi.fn(),
          pending: false,
        }}
      />,
      { wrapper },
    );
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Run tests")).toBeVisible();
    fireEvent.click(screen.getByText("Run tests"));
    await screen.findByText("first page");
    expect(apiFetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("first pagesecond page");
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("offset=10&revision=v1"),
      expect.anything(),
    );
    fireEvent.click(screen.getByText("Run tests"));
    await waitFor(() =>
      expect(
        screen.queryByText("first pagesecond page"),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Run tests"));
    await screen.findByText("first pagesecond page");
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });
  it("shows errors and restarts from the first page after a revision conflict", async () => {
    mockDetails();
    render(<ToolMessageDetails event={tool} userId="user" />, { wrapper });
    await screen.findByText("first page");
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new Error("message changed; reload details"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("message changed; reload details");
    mockDetails();
    fireEvent.click(screen.getByRole("button", { name: "Reload details" }));
    await waitFor(() =>
      expect(
        screen.queryByText("message changed; reload details"),
      ).not.toBeInTheDocument(),
    );
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("offset=0"),
      expect.anything(),
    );
  });
  it("loads a fresh final snapshot even when the running history timestamp is unchanged", async () => {
    mockDetails();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const tree = (event: ToolCallEvent) => (
      <QueryClientProvider client={client}>
        <ToolMessageDetails event={event} userId="user" />
      </QueryClientProvider>
    );
    const view = render(tree({ ...tool, status: "running" }));
    await screen.findByText("first page");
    vi.mocked(apiFetch).mockImplementation(async (path) => ({
      message_id: "message",
      section: path.includes("section=input") ? "input" : "output",
      format: "text",
      text: path.includes("section=input") ? "" : "final output",
      revision: "v2",
      next_offset: 12,
      has_more: false,
    }));
    view.rerender(tree(tool));
    await screen.findByText("final output");
    expect(apiFetch).toHaveBeenCalledTimes(4);
    client.clear();
  });
});
