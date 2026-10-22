/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DaemonCommandRecord, Node } from "@/features/api/types";
import { NodePaxlUpgrade } from "./node-paxl-upgrade";

const api = vi.hoisted(() => ({
  commandResults: [] as unknown[],
  fetch: vi.fn(),
  release: vi.fn(),
  upgrade: vi.fn(),
}));

vi.mock("@/features/api/client", () => ({
  API_BASE_URL: "/api/pax",
  apiFetch: api.fetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

beforeEach(() => {
  api.commandResults = [];
  api.release.mockResolvedValue({ version: "1.2.3" });
  api.upgrade.mockImplementation(async (body: { command_id: string }) => ({
    command_id: body.command_id,
    command_status: "received",
    dispatch_status: "acknowledged",
  }));
  api.fetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.includes("product=paxl")) {
      return api.release();
    }
    if (path.endsWith("/paxl/upgrade")) {
      return api.upgrade(JSON.parse(String(init?.body)));
    }
    if (path.includes("/daemon/commands/")) {
      return api.commandResults.length > 1
        ? api.commandResults.shift()
        : api.commandResults[0];
    }
    throw new Error(`unexpected request ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function paxlNode(overrides: Partial<Node> = {}): Node {
  return {
    arch: "arm64",
    hostname: "fixture",
    metadata: { paxl: { status: "installed", version: "1.2.2" } },
    node_id: "node1",
    online: true,
    os: "darwin",
    ...overrides,
  };
}

function mount(node: Node = paxlNode()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NodePaxlUpgrade node={node} userId="user1" />
    </QueryClientProvider>,
  );
}

function commandResult(status: string, phase?: string) {
  return {
    command: {
      command_id: "ignored",
      result: phase ? { phase } : undefined,
      status,
      type: "paxl.upgrade",
    },
    type: "command.get",
  };
}

it("installs the stable release and follows paxd phases until verified", async () => {
  const user = userEvent.setup();
  api.commandResults = [
    commandResult("received", "activating"),
    commandResult("applied", "verified"),
  ];
  mount();

  await user.click(screen.getByRole("button", { name: "Upgrade paxl" }));
  const install = await screen.findByRole("button", {
    name: "Install paxl update",
  });
  await waitFor(() => expect(install).toBeEnabled());
  await user.click(install);

  await waitFor(() => expect(api.upgrade).toHaveBeenCalledOnce());
  expect(api.upgrade.mock.calls[0][0]).toMatchObject({
    tag: "stable",
    version: "1.2.3",
  });
  const progress = await screen.findByRole("list", { name: "Progress" });
  expect(within(progress).getByText("Activating")).toBeInTheDocument();
  expect(
    await screen.findByText("paxl 1.2.3 verified", {}, { timeout: 3000 }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
});

it("resumes a recorded in-progress upgrade instead of offering a new one", async () => {
  const user = userEvent.setup();
  const running: DaemonCommandRecord = {
    command_id: "cmd_recorded",
    created_at: "2026-10-22T10:00:00Z",
    node_id: "node1",
    phase: "downloading",
    state: "in_progress",
    status: "received",
    target_version: "1.2.3",
    type: "paxl.upgrade",
    updated_at: "2026-10-22T10:00:00Z",
  };
  api.commandResults = [{ daemon_command: running, type: "command.get" }];
  mount(paxlNode({ latest_daemon_commands: [running] }));

  expect(screen.getByRole("status")).toHaveTextContent(
    "Upgrading paxl to 1.2.3",
  );
  await user.click(screen.getByRole("button", { name: "Upgrade paxl" }));

  expect(
    await screen.findByRole("list", { name: "Progress" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Install paxl update" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      "/api/v1/user/user1/nodes/node1/daemon/commands/cmd_recorded",
    ),
  );
  expect(api.upgrade).not.toHaveBeenCalled();
});

it("shows the last recorded result after a reload", () => {
  mount(
    paxlNode({
      latest_daemon_commands: [
        {
          command_id: "cmd_done",
          completed_at: "2026-10-22T10:01:00Z",
          created_at: "2026-10-22T10:00:00Z",
          node_id: "node1",
          state: "succeeded",
          status: "applied",
          target_version: "1.2.3",
          type: "paxl.upgrade",
          updated_at: "2026-10-22T10:01:00Z",
        },
      ],
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("paxl 1.2.3 verified");
});

it("reports a failed upgrade and starts over with a new command on retry", async () => {
  const user = userEvent.setup();
  api.commandResults = [
    {
      command: {
        command_id: "ignored",
        error_message: "rename /usr/local/bin/paxl: permission denied",
        result: { phase: "failed" },
        status: "failed",
        type: "paxl.upgrade",
      },
      type: "command.get",
    },
  ];
  mount();

  await user.click(screen.getByRole("button", { name: "Upgrade paxl" }));
  const install = await screen.findByRole("button", {
    name: "Install paxl update",
  });
  await waitFor(() => expect(install).toBeEnabled());
  await user.click(install);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "permission denied",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  const again = await screen.findByRole("button", {
    name: "Install paxl update",
  });
  await waitFor(() => expect(again).toBeEnabled());
  await user.click(again);
  await waitFor(() => expect(api.upgrade).toHaveBeenCalledTimes(2));
  expect(api.upgrade.mock.calls[1][0].command_id).not.toBe(
    api.upgrade.mock.calls[0][0].command_id,
  );
});

it("shows offline versions as last observations and disables upgrade", () => {
  mount(paxlNode({ online: false }));
  expect(screen.getByText(/last observed/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upgrade paxl" })).toBeDisabled();
});

it("shows a failed release check and lets the user retry without issuing an upgrade", async () => {
  api.release.mockRejectedValueOnce(
    new Error("Requested API endpoint was not found (HTTP 404)."),
  );
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Upgrade paxl" }));
  await screen.findByText(/Release check failed/);
  expect(
    screen.queryByText("Checking stable release…"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Install paxl update" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry release check" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Install paxl update" }),
    ).toBeEnabled(),
  );
  expect(api.release).toHaveBeenCalledTimes(2);
  expect(api.upgrade).not.toHaveBeenCalled();
});
