/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodeHarnessUpgrade } from "./node-harness-upgrade";
const mocks = vi.hoisted(() => ({
  useNodeDaemonAgentConnections: vi.fn(),
  getNodeDaemonCommand: vi.fn(),
  upgradeNodeHarness: vi.fn(),
}));
vi.mock("@/features/api/resources", () => mocks);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.useNodeDaemonAgentConnections.mockReturnValue({
    data: {
      agent_connections: {
        items: [
          {
            id: "adapter",
            name: "Claude",
            harness: "claude-code",
            enabled: true,
            desired_state: "running",
          },
        ],
      },
    },
  });
  mocks.upgradeNodeHarness.mockResolvedValue({ command_status: "received" });
  mocks.getNodeDaemonCommand.mockResolvedValue({
    command: { status: "received", result: { phase: "downloading" } },
  });
});
afterEach(cleanup);
function mount(online = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NodeHarnessUpgrade
        userId="user1"
        node={{
          node_id: "node1",
          hostname: "fixture",
          online,
          os: "darwin",
          arch: "arm64",
          metadata: { paxl: { status: "installed", version: "1.2.2" } },
        }}
      />
    </QueryClientProvider>,
  );
}
it("keeps received pending and recovers the same command after reload", async () => {
  const user = userEvent.setup();
  const first = mount();
  await user.type(screen.getByLabelText("Target version"), "1.2.3");
  await user.selectOptions(screen.getByLabelText("ACP connection"), "adapter");
  await user.click(
    screen.getByRole("button", { name: "Upgrade selected component" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Install update" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Install update" }));
  await waitFor(() => expect(mocks.upgradeNodeHarness).toHaveBeenCalledOnce());
  const request = mocks.upgradeNodeHarness.mock.calls[0][2];
  expect(request.version).toBe("1.2.3");
  expect(request.component).toBe("acp");
  expect(request.connection_id).toBe("adapter");
  expect(
    screen.queryByRole("option", { name: "Native CLI" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Claude ACP adapter 1.2.3 verified"),
  ).not.toBeInTheDocument();
  first.unmount();
  mocks.getNodeDaemonCommand.mockResolvedValue({
    command: {
      status: "applied",
      result: {
        phase: "verified",
        paxl: { status: "installed", version: "1.2.3" },
      },
    },
  });
  mount();
  await screen.findByText("Claude ACP adapter 1.2.3 verified");
  expect(mocks.getNodeDaemonCommand).toHaveBeenCalledWith(
    "user1",
    "node1",
    request.command_id,
  );
  expect(mocks.upgradeNodeHarness).toHaveBeenCalledOnce();
});
it("disables upgrades for offline nodes", () => {
  mount(false);
  expect(
    screen.getByRole("button", { name: "Upgrade selected component" }),
  ).toBeDisabled();
});

it("preserves a rejected ACK without waiting for a command that was never stored", async () => {
  mocks.upgradeNodeHarness.mockResolvedValue({
    command_status: "rejected",
    command_ack: { error: { message: "Upgrade paxd before retrying" } },
  });
  const user = userEvent.setup();
  const first = mount();
  await user.type(screen.getByLabelText("Target version"), "1.2.3");
  await user.selectOptions(screen.getByLabelText("ACP connection"), "adapter");
  await user.click(
    screen.getByRole("button", { name: "Upgrade selected component" }),
  );
  await user.click(screen.getByRole("button", { name: "Install update" }));
  await screen.findByText("Upgrade paxd before retrying");
  expect(
    screen.getByRole("button", { name: "Upgrade selected component" }),
  ).toBeEnabled();
  first.unmount();
  mount();
  await screen.findByText("Upgrade paxd before retrying");
  expect(mocks.upgradeNodeHarness).toHaveBeenCalledOnce();
});

it("submits a native CLI upgrade without an ACP connection", async () => {
  mocks.useNodeDaemonAgentConnections.mockReturnValue({
    data: { agent_connections: { items: [] } },
  });
  const user = userEvent.setup();
  mount();
  await user.selectOptions(screen.getByLabelText("Component"), "cli");
  await user.selectOptions(screen.getByLabelText("Harness"), "pi");
  await screen.findByText(/Updating the Pi CLI does not update the SDK/);
  expect(screen.queryByLabelText("ACP connection")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Target version"), "1.2.3");
  await user.click(
    screen.getByRole("button", { name: "Upgrade selected component" }),
  );
  await user.click(screen.getByRole("button", { name: "Install update" }));
  await waitFor(() => expect(mocks.upgradeNodeHarness).toHaveBeenCalledOnce());
  expect(mocks.upgradeNodeHarness.mock.calls[0][2]).toMatchObject({
    harness: "pi",
    component: "cli",
    version: "1.2.3",
  });
  expect(mocks.upgradeNodeHarness.mock.calls[0][2]).not.toHaveProperty(
    "connection_id",
  );
});
