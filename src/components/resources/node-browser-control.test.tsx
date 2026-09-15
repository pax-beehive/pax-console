/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { NodeBrowserControl, NodeBrowserViewer } from "./node-browser-control";
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
  mocks.control.mockImplementation(async (_user, _node, op, payload) =>
    op === "state"
      ? state
      : payload.action.type === "tabs"
        ? { tabs: [] }
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
  expect(screen.queryByRole("button", { name: "Tab" })).not.toBeInTheDocument();
  const actions = () =>
    mocks.control.mock.calls.filter(
      (call) => call[2] === "view" && call[3].action.type === "screenshot",
    );
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
  mocks.control.mockImplementation(async (_user, _node, op, payload) => {
    if (op === "state") return state;
    if (payload.action.type === "tabs") return { tabs: [] };
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

it("selects a preview tab without controlling the agent and displays its recent target", async () => {
  mocks.control.mockClear();
  const user = userEvent.setup();
  const state = {
    policy: { paused: false, origins: [] },
    pending: [],
    grants: [],
    sensitiveSessions: [],
    workers: [{ session: "browser-3", seen: Date.now() }],
    operator: null,
    audit: [],
  };
  mocks.control.mockImplementation(async (_user, _node, op, payload) => {
    if (op === "state") return state;
    if (payload.action.type === "tabs")
      return {
        activeTabID: "tab1",
        tabs: [
          { id: "tab1", title: "Search", restricted: false },
          { id: "tab2", title: "Wikipedia", restricted: false },
        ],
      };
    return {
      frame: "",
      image: "aW1hZ2U=",
      width: 800,
      height: 600,
      pointer: { x: 120, y: 60, action: "click", at: Date.now() },
    };
  });
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
    await screen.findByLabelText("Agent's recent interaction"),
  ).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Browser tab" }),
    "tab2",
  );
  await waitFor(() =>
    expect(
      mocks.control.mock.calls.some(
        (call) =>
          call[2] === "view" &&
          call[3].action.type === "screenshot" &&
          call[3].action.tabID === "tab2",
      ),
    ).toBe(true),
  );
  expect(
    mocks.control.mock.calls.every(
      (call) =>
        call[2] === "state" ||
        ["tabs", "screenshot"].includes(call[3].action.type),
    ),
  ).toBe(true);

  client.clear();
});

it("keeps selectors enabled during capture and discards a frame after selection changes", async () => {
  const user = userEvent.setup();
  let finishCapture!: (value: unknown) => void;
  mocks.control.mockImplementation(async (_user, _node, operation, payload) => {
    if (operation === "state")
      return {
        policy: { paused: false, origins: [] },
        pending: [],
        grants: [],
        sensitiveSessions: [],
        workers: [{ session: "browser-1", seen: Date.now() }],
        operator: null,
        audit: [],
      };
    if (payload.action.type === "tabs")
      return {
        tabs: [{ id: "second", title: "Second tab", restricted: false }],
      };
    return new Promise((resolve) => {
      finishCapture = resolve;
    });
  });
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
  const tabs = await screen.findByRole("combobox", { name: "Browser tab" });
  await waitFor(() => expect(finishCapture).toBeDefined());
  expect(tabs).toBeEnabled();
  expect(
    screen.getByRole("combobox", { name: "Connected browser" }),
  ).toBeEnabled();
  await user.selectOptions(tabs, "second");
  await act(async () => {
    finishCapture({ frame: "", image: "old-frame", width: 800, height: 600 });
  });
  expect(tabs).toHaveValue("second");
  expect(tabs).toBeEnabled();
  expect(
    screen.queryByRole("img", { name: "Current browser page" }),
  ).not.toBeInTheDocument();
  client.clear();
});

it("automatically follows recent browser activity without selectors in the session window", async () => {
  mocks.control.mockClear();
  const state = {
    policy: { paused: false, origins: [] },
    pending: [],
    grants: [],
    sensitiveSessions: [],
    operator: null,
    workers: [
      { session: "old", seen: 2 },
      { session: "active", seen: 1 },
    ],
    audit: [{ at: "", event: "tool.started", session: "active" }],
  };
  mocks.control.mockImplementation(async (_user, _node, operation) =>
    operation === "state"
      ? state
      : { frame: "", image: "aW1hZ2U=", width: 800, height: 600 },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NodeBrowserViewer nodeId="node" userId="user" />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("img", { name: "Current browser page" }),
  ).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Take control" })).toBeVisible();
  expect(mocks.control).toHaveBeenCalledWith("user", "node", "view", {
    session: "active",
    action: { type: "screenshot", tabID: undefined },
  });
  expect(
    mocks.control.mock.calls
      .filter((call) => call[2] === "view")
      .every((call) => call[3].action.type === "screenshot"),
  ).toBe(true);
  client.clear();
});

it("releases native takeover when the page blurs, including pending acquisition", async () => {
  mocks.control.mockReset();
  const user = userEvent.setup();
  const state = {
    policy: { paused: false, origins: [] },
    pending: [],
    grants: [],
    sensitiveSessions: [],
    workers: [{ session: "native", seen: Date.now() }],
    operator: null as string | null,
    audit: [],
  };
  let acquired!: () => void;
  mocks.control.mockImplementation(async (_u, _n, operation, payload) => {
    if (operation === "state") return { ...state };
    if (payload.action.type === "takeover") {
      state.operator = "native";
      await new Promise<void>((resolve) => {
        acquired = resolve;
      });
      return {};
    }
    if (payload.action.type === "release") {
      state.operator = null;
      return {};
    }
    return { frame: "frame", image: "aW1hZ2U=", width: 800, height: 600 };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NodeBrowserViewer userId="u" nodeId="n" />
    </QueryClientProvider>,
  );
  await screen.findByRole("img");
  const take = screen.getByRole("button", { name: "Take control" });
  await waitFor(() => expect(take).toBeEnabled());
  await user.click(take);
  act(() => window.dispatchEvent(new Event("blur")));
  await waitFor(() =>
    expect(mocks.control).toHaveBeenCalledWith("u", "n", "view", {
      session: "native",
      action: { type: "release" },
    }),
  );
  await act(async () => {
    acquired();
  });
  act(() => window.dispatchEvent(new Event("focus")));
  expect(
    mocks.control.mock.calls.filter((c) => c[3]?.action?.type === "takeover"),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Browser image; click to interact" }),
  ).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});
