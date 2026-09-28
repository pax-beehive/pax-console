/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  act,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBrowserApprovals } from "./session-browser-approvals";
const mocks = vi.hoisted(() => ({ control: vi.fn() }));
vi.mock("@/features/browser-control/api", () => ({
  browserControl: mocks.control,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(paused = false) {
  let pending = [
    {
      id: "one",
      origin: "https://example.com",
      session: "browser-one",
      decision: "pending",
    },
    {
      id: "two",
      origin: "https://example.org",
      session: "browser-two",
      decision: "pending",
    },
  ];
  mocks.control.mockImplementation(async (_user, _node, operation, payload) => {
    if (operation === "state")
      return { policy: { paused }, pending, workers: [] };
    pending = pending.filter((request) => request.id !== payload.id);
    return {};
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <input aria-label="Chat composer" />
        <SessionBrowserApprovals userId="user" nodeId="node" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return client;
}

it("shows requests without a preview and decides only the identified request", async () => {
  const client = setup();
  const user = userEvent.setup();
  const origin = await screen.findByText("https://example.com");
  expect(screen.getByText("browser-one")).toBeVisible();
  await user.type(screen.getByRole("textbox"), "continue");
  await user.click(
    within(origin.parentElement!).getByRole("button", {
      name: "Allow browser session",
    }),
  );
  expect(mocks.control).toHaveBeenCalledWith("user", "node", "decide", {
    id: "one",
    decision: "allow",
    scope: "session",
  });
  await waitFor(() =>
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Deny" }));
  expect(mocks.control).toHaveBeenCalledWith("user", "node", "decide", {
    id: "two",
    decision: "deny",
    scope: "session",
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Browser approval requests" }),
    ).not.toBeInTheDocument(),
  );
  expect(mocks.control.mock.calls.every((call) => call[2] !== "view")).toBe(
    true,
  );
  client.clear();
});

it("retains a failed decision for retry and permits denial while paused", async () => {
  const client = setup(true);
  const user = userEvent.setup();
  const origin = await screen.findByText("https://example.com");
  const row = within(origin.parentElement!);
  expect(
    row.getByRole("button", { name: "Allow browser session" }),
  ).toBeDisabled();
  mocks.control.mockRejectedValueOnce(new Error("Decision unavailable"));
  await user.click(row.getByRole("button", { name: "Deny" }));
  expect(await screen.findByText("Error: Decision unavailable")).toBeVisible();
  expect(origin).toBeVisible();
  await user.click(row.getByRole("button", { name: "Deny" }));
  await waitFor(() =>
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument(),
  );
  client.clear();
});

it("shows immediate feedback and unlocks the next request before the refresh finishes", async () => {
  const client = setup();
  const user = userEvent.setup();
  const origin = await screen.findByText("https://example.com");
  let acknowledge!: (value: unknown) => void;
  mocks.control.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  await user.click(
    within(origin.parentElement!).getByRole("button", {
      name: "Allow browser session",
    }),
  );
  expect(screen.getByRole("button", { name: "Allowing…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Sending your decision…",
  );
  let finishRefresh!: (value: unknown) => void;
  mocks.control.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
  );
  await act(async () => acknowledge({}));
  await waitFor(() =>
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Allow browser session" }),
  ).toBeEnabled();
  expect(finishRefresh).toBeDefined();
  await act(async () =>
    finishRefresh({ policy: { paused: false }, pending: [], workers: [] }),
  );
  client.clear();
});
