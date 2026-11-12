/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/features/api/query-keys";
import type { AgentApproval } from "@/features/api/types";
import { SessionSearchApprovals } from "./session-search-approvals";

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }));
vi.mock("@/features/api/resources", () => ({
  listTurnSearchApprovals: mocks.list,
  decideApproval: mocks.decide,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});

function setup(
  turnId: string | undefined,
  records?: (approval: AgentApproval) => AgentApproval[],
) {
  const approval: AgentApproval = {
    approval_id: "access_current",
    status: "pending",
    domain: "workspace",
    operation: "search",
    resource_type: "turn",
    resource_ref: "turn_current",
    request_agent_id: "agent",
    request_session_id: "session",
    request_body: { scope: { queries: ["cicd"], session_ids: ["*"] } },
  };
  mocks.list.mockResolvedValue({
    approvals: records
      ? records(approval)
      : [
          approval,
          { ...approval, approval_id: "old", resource_ref: "turn_old" },
          {
            ...approval,
            approval_id: "other_session",
            request_session_id: "other",
          },
          {
            ...approval,
            approval_id: "expired",
            expires_at: "2020-01-01T00:00:00Z",
          },
        ],
  });
  mocks.decide.mockResolvedValue({
    approval: { ...approval, status: "approved" },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const renderTurn = (currentTurn: string | undefined) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SessionSearchApprovals
          userId="user"
          agentId="agent"
          sessionId="session"
          turnId={currentTurn}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(renderTurn(turnId));
  return { approval, client, view, renderTurn };
}

it("hides revoked and expired pending requests while preserving a request without a time limit", async () => {
  const { client } = setup("turn_current", (approval) => [
    {
      ...approval,
      title: "No time limit",
      request_body: { ...approval.request_body, timeout_seconds: 0 },
    },
    {
      ...approval,
      approval_id: "revoked",
      title: "Cancelled pending request",
      grant_revoked_at: "2026-11-11T00:00:00Z",
    },
    {
      ...approval,
      approval_id: "expired",
      title: "Expired pending request",
      expires_at: "2020-01-01T00:00:00Z",
    },
    {
      ...approval,
      approval_id: "cancelled_status",
      title: "Cancelled request",
      status: "cancelled",
    },
    {
      ...approval,
      approval_id: "expired_status",
      title: "Expired request",
      status: "expired",
    },
  ]);
  expect(await screen.findByText("No time limit")).toBeVisible();
  expect(
    screen.queryByText("Cancelled pending request"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Expired pending request")).not.toBeInTheDocument();
  expect(screen.queryByText("Cancelled request")).not.toBeInTheDocument();
  expect(screen.queryByText("Expired request")).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Allow this turn" }),
  ).toHaveLength(1);
  client.clear();
});

it("removes a cached pending request when the agent cancels it", async () => {
  const { approval, client } = setup("turn_current", (approval) => [
    { ...approval, title: "Cancel while pending" },
  ]);
  expect(await screen.findByText("Cancel while pending")).toBeVisible();
  mocks.list.mockResolvedValue({
    approvals: [
      {
        ...approval,
        title: "Cancel while pending",
        grant_revoked_at: "2026-11-11T00:00:00Z",
      },
      {
        ...approval,
        approval_id: "replacement",
        title: "Another pending request",
      },
    ],
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: queryKeys.approvals("user") });
  });
  expect(await screen.findByText("Another pending request")).toBeVisible();
  expect(screen.queryByText("Cancel while pending")).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Allow this turn" }),
  ).toHaveLength(1);
  expect(mocks.decide).not.toHaveBeenCalled();
  client.clear();
});

it("removes an expiring request at its deadline without waiting for another poll", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T00:00:00Z"));
  const expires = new Date(Date.now() + 2_000).toISOString();
  const { client } = setup("turn_current", (approval) => [
    { ...approval, title: "Short request", expires_at: expires },
  ]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("Short request")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(screen.queryByText("Short request")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Allow this turn" }),
  ).not.toBeInTheDocument();
  expect(mocks.list).toHaveBeenCalledTimes(1);
  client.clear();
});

it("decides only the current turn request without a conversation resume", async () => {
  const user = userEvent.setup();
  const { client } = setup("turn_current");
  expect(await screen.findByText("Queries: cicd")).toBeVisible();
  expect(screen.getByText("Agents: All your agents")).toBeVisible();
  expect(mocks.list).toHaveBeenCalledWith(
    "user",
    "agent",
    "session",
    "turn_current",
    expect.any(AbortSignal),
  );
  expect(
    screen.getAllByRole("button", { name: "Allow this turn" }),
  ).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Allow this turn" }));
  await waitFor(() =>
    expect(mocks.decide).toHaveBeenCalledWith(
      "user",
      "access_current",
      "allow_once",
    ),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Allow this turn" }),
    ).not.toBeInTheDocument(),
  );
  client.clear();
});

it("isolates request data and fetches a new scope when the active turn changes", async () => {
  const { client, view, renderTurn } = setup("turn_current");
  await screen.findByText("Queries: cicd");
  mocks.list.mockResolvedValue({
    approvals: [
      {
        approval_id: "access_next",
        title: "Next turn request",
        status: "pending",
        domain: "workspace",
        operation: "search",
        resource_type: "turn",
        resource_ref: "turn_next",
        request_agent_id: "agent",
        request_session_id: "session",
        request_body: {
          scope: { agent_ids: ["self"], queries: ["cicd"], session_ids: ["*"] },
        },
      },
    ],
  });
  view.rerender(renderTurn("turn_next"));
  expect(screen.queryByText("Queries: cicd")).not.toBeInTheDocument();
  expect(await screen.findByText("Next turn request")).toBeVisible();
  expect(screen.getByText("Agents: Calling agent")).toBeVisible();
  expect(mocks.list).toHaveBeenLastCalledWith(
    "user",
    "agent",
    "session",
    "turn_next",
    expect.any(AbortSignal),
  );
  client.clear();
});

it("does not show or poll authorization requests after the turn ends", () => {
  const { client } = setup(undefined);
  expect(
    screen.queryByRole("region", { name: "Search scope requests" }),
  ).not.toBeInTheDocument();
  expect(mocks.list).not.toHaveBeenCalled();
  client.clear();
});
