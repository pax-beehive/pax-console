/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionSearchApprovals } from "./session-search-approvals";

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }));
vi.mock("@/features/api/resources", () => ({
  listTurnSearchApprovals: mocks.list,
  decideApproval: mocks.decide,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(turnId: string | undefined) {
  const approval = {
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
    approvals: [
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
  return { client, view, renderTurn };
}

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
