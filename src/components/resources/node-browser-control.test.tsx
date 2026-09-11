/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { NodeBrowserControl } from "./node-browser-control";
const mocks = vi.hoisted(() => ({ control: vi.fn() }));
vi.mock("@/features/browser-control/api", () => ({
  browserControl: mocks.control,
}));
vi.mock("./node-browser-vnc", () => ({ NodeBrowserVNC: () => null }));
vi.mock("./node-secret-channel-push", () => ({
  NodeSecretChannelPush: () => null,
}));
afterEach(cleanup);
it("continuously previews without takeover, pauses on request, and keeps input disabled", async () => {
  const user = userEvent.setup();
  const state = {
    policy: { paused: false, origins: [] },
    pending: [],
    grants: [],
    sensitiveSessions: [],
    workers: [{ session: "browser-1", seen: Date.now() }],
    operator: null,
    audit: [],
  };
  mocks.control.mockImplementation(async (_user, _node, op) =>
    op === "state"
      ? state
      : { frame: "", image: "aW1hZ2U=", width: 800, height: 600 },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NodeBrowserControl nodeId="node" userId="user" />
    </QueryClientProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "Open browser control" }),
  );
  expect(
    await screen.findByRole("img", { name: "Current browser page" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Browser image; read-only preview" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Tab" })).toBeDisabled();
  const actions = () =>
    mocks.control.mock.calls.filter((call) => call[2] === "view");
  await waitFor(() => expect(actions().length).toBeGreaterThanOrEqual(2), {
    timeout: 5000,
  });
  expect(
    actions().every(
      (call) =>
        call[3].session === "browser-1" && call[3].action.type === "screenshot",
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Pause live view" }));
  const count = actions().length;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  expect(actions()).toHaveLength(count);
  client.clear();
}, 10000);

it("automatically recovers a failed capture and reports the interruption beside the viewer", async () => {
  mocks.control.mockClear();
  const user = userEvent.setup();
  const state = {
    policy: { paused: false, origins: [] },
    pending: [],
    grants: [],
    sensitiveSessions: [],
    workers: [{ session: "browser-2", seen: Date.now() }],
    operator: null,
    audit: [],
  };
  let captures = 0;
  mocks.control.mockImplementation(async (_user, _node, op) => {
    if (op === "state") return state;
    if (++captures === 1) throw new Error("Browser worker is busy");
    return { frame: "", image: "aW1hZ2U=", width: 800, height: 600 };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <NodeBrowserControl nodeId="node" userId="user" />
    </QueryClientProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "Open browser control" }),
  );
  expect(
    await screen.findByText(
      "Preview interrupted. Reconnecting automatically...",
    ),
  ).toBeVisible();
  expect(screen.getByText(/Browser worker is busy/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Refresh image" }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByRole(
      "img",
      { name: "Current browser page" },
      { timeout: 12000 },
    ),
  ).toBeVisible();
  expect(screen.queryByText(/Browser worker is busy/)).not.toBeInTheDocument();
  expect(captures).toBeGreaterThanOrEqual(2);
  rendered.unmount();
  const count = captures;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  expect(captures).toBe(count);
  client.clear();
}, 16000);
