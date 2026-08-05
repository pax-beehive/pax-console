/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeMaintenanceActions } from "./node-maintenance-actions";

const mocks = vi.hoisted(() => ({
  restartNodeDaemon: vi.fn(),
  upgradeNodeDaemon: vi.fn(),
  useLatestPaxdRelease: vi.fn(),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    restartNodeDaemon: mocks.restartNodeDaemon,
    upgradeNodeDaemon: mocks.upgradeNodeDaemon,
    useLatestPaxdRelease: mocks.useLatestPaxdRelease,
  };
});

beforeEach(() => {
  mocks.restartNodeDaemon.mockReset();
  mocks.upgradeNodeDaemon.mockReset();
  mocks.useLatestPaxdRelease.mockReset();
  mocks.useLatestPaxdRelease.mockReturnValue({
    data: {
      platform: "darwin/arm64",
      product: "paxd",
      sha256: "abc123",
      size_bytes: 12_345_678,
      tags: ["stable"],
      version: "1.2.3",
    },
    error: null,
    isLoading: false,
  });
  mocks.restartNodeDaemon.mockResolvedValue({
    command_id: "cmd_restart_1",
    command_status: "received",
    dispatch_status: "acknowledged",
  });
  mocks.upgradeNodeDaemon.mockResolvedValue({
    command_id: "cmd_upgrade_1",
    command_status: "received",
    confirmation_status: "awaiting_new_boot",
    dispatch_status: "acknowledged",
    expected_version: "1.2.3",
  });
});

afterEach(() => cleanup());

describe("NodeMaintenanceActions", () => {
  it("restarts paxd immediately only after confirmation", async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Restart paxd immediately" }),
    );
    expect(mocks.restartNodeDaemon).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Restart immediately" }),
    );

    await waitFor(() =>
      expect(mocks.restartNodeDaemon).toHaveBeenCalledWith("user_1", "node_1"),
    );
    expect(await screen.findByText(/cmd_restart_1/)).toBeInTheDocument();
  });

  it("resolves and submits the latest stable version for the node platform", async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade paxd immediately" }),
    );
    expect(
      await screen.findByText("Latest stable version"),
    ).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Target version" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade immediately" }),
    );

    await waitFor(() =>
      expect(mocks.upgradeNodeDaemon).toHaveBeenCalledWith("user_1", "node_1", {
        version: "1.2.3",
      }),
    );
    expect(await screen.findByText(/cmd_upgrade_1/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting new boot/i)).toBeInTheDocument();
  });

  it("does not offer a redundant upgrade when the node is already current", async () => {
    renderActions({ currentVersion: "1.2.3" });

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade paxd immediately" }),
    );

    expect(await screen.findByText("paxd is up to date.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Already up to date" }),
    ).toBeDisabled();
  });
});

function renderActions({ currentVersion = "1.2.2" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NodeMaintenanceActions
          currentVersion={currentVersion}
          nodeArch="arm64"
          nodeId="node_1"
          nodeLabel="Development Mac"
          nodeOS="darwin"
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
