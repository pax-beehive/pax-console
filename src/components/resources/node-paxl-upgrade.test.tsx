/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodePaxlUpgrade } from "./node-paxl-upgrade";
const mocks = vi.hoisted(() => ({
  getLatestPaxlRelease: vi.fn(),
  getNodeDaemonCommand: vi.fn(),
  upgradeNodePaxl: vi.fn(),
}));
vi.mock("@/features/api/resources", () => mocks);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.getLatestPaxlRelease.mockResolvedValue({ version: "1.2.3" });
  mocks.upgradeNodePaxl.mockResolvedValue({ command_status: "received" });
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
      <NodePaxlUpgrade
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
  await user.click(screen.getByRole("button", { name: "Upgrade paxl" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Install paxl update" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Install paxl update" }));
  await waitFor(() => expect(mocks.upgradeNodePaxl).toHaveBeenCalledOnce());
  const request = mocks.upgradeNodePaxl.mock.calls[0][2];
  expect(request.version).toBe("1.2.3");
  expect(screen.queryByText("paxl 1.2.3 verified")).not.toBeInTheDocument();
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
  await screen.findByText("paxl 1.2.3 verified");
  expect(mocks.getNodeDaemonCommand).toHaveBeenCalledWith(
    "user1",
    "node1",
    request.command_id,
  );
  expect(mocks.upgradeNodePaxl).toHaveBeenCalledOnce();
});
it("shows offline versions as last observations and disables upgrade", () => {
  mount(false);
  expect(screen.getByText(/last observed/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upgrade paxl" })).toBeDisabled();
});
