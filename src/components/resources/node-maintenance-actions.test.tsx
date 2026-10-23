/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeMaintenanceActions } from "./node-maintenance-actions";

const api = vi.hoisted(() => ({
  command: vi.fn(),
  fetch: vi.fn(),
  restart: vi.fn(),
  upgrade: vi.fn(),
}));

vi.mock("@/features/api/client", () => ({
  API_BASE_URL: "/api/pax",
  apiFetch: api.fetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

beforeEach(() => {
  api.restart.mockResolvedValue({
    command_id: "cmd_restart_1",
    command_status: "received",
    dispatch_status: "acknowledged",
  });
  api.upgrade.mockResolvedValue({
    command_id: "cmd_upgrade_1",
    command_status: "received",
    confirmation_status: "awaiting_new_boot",
    dispatch_status: "acknowledged",
    expected_version: "1.2.3",
  });
  api.command.mockResolvedValue({
    command: {
      command_id: "cmd_upgrade_1",
      status: "received",
      type: "paxd.upgrade",
    },
    maintenance_confirmation: {
      expected_version: "1.2.3",
      status: "awaiting_new_boot",
    },
    type: "command.get",
  });
  api.fetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/v1/public/paxd/download")) {
      return {
        platform: "darwin/arm64",
        product: "paxd",
        sha256: "abc123",
        size_bytes: 12_345_678,
        tags: ["stable"],
        version: "1.2.3",
      };
    }
    if (path.endsWith("/daemon/restart")) {
      return api.restart(JSON.parse(String(init?.body)));
    }
    if (path.endsWith("/daemon/upgrade")) {
      return api.upgrade(JSON.parse(String(init?.body)));
    }
    if (path.includes("/daemon/commands/")) {
      return api.command(path);
    }
    throw new Error(`unexpected request ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodeMaintenanceActions", () => {
  it("restarts paxd only after confirmation and tracks it until back online", async () => {
    api.command.mockResolvedValue({
      command: {
        command_id: "cmd_restart_1",
        status: "received",
        type: "paxd.restart",
      },
      maintenance_confirmation: { status: "confirmed" },
      type: "command.get",
    });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Restart paxd immediately" }),
    );
    expect(api.restart).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Restart immediately" }),
    );

    await waitFor(() => expect(api.restart).toHaveBeenCalledOnce());
    expect(api.restart.mock.calls[0][0]).toMatchObject({ mode: "immediate" });
    expect(
      await screen.findByText("paxd restarted and is back online."),
    ).toBeInTheDocument();
    expect(api.command).toHaveBeenCalledWith(
      "/api/v1/user/user_1/nodes/node_1/daemon/commands/cmd_restart_1",
    );
  });

  it("resolves and submits the latest stable version for the node platform", async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade paxd immediately" }),
    );
    expect(
      await screen.findByText("Latest stable version"),
    ).toBeInTheDocument();
    expect(await screen.findByText("1.2.3")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade immediately" }),
    );

    await waitFor(() => expect(api.upgrade).toHaveBeenCalledOnce());
    expect(api.upgrade.mock.calls[0][0]).toMatchObject({
      mode: "immediate",
      tag: "stable",
      version: "1.2.3",
    });
    expect(
      await screen.findByText("Installing and restarting paxd"),
    ).toBeInTheDocument();
    expect(screen.getByText("Running 1.2.3")).toBeInTheDocument();
    expect(
      screen.getByText(/keeps the command running on the device/),
    ).toBeInTheDocument();
  });

  it("keeps waiting while the restarted node is unreachable", async () => {
    api.command.mockRejectedValue(
      new Error("node control tunnel is not connected"),
    );
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade paxd immediately" }),
    );
    await screen.findByText("1.2.3");
    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade immediately" }),
    );

    expect(
      await screen.findByText("Waiting for the device to reconnect…"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a version mismatch as a failed upgrade", async () => {
    api.command.mockResolvedValue({
      command: {
        command_id: "cmd_upgrade_1",
        status: "received",
        type: "paxd.upgrade",
      },
      maintenance_confirmation: {
        expected_version: "1.2.3",
        observed_version: "1.2.2",
        status: "version_mismatch",
      },
      type: "command.get",
    });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade paxd immediately" }),
    );
    await screen.findByText("1.2.3");
    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade immediately" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "paxd reported 1.2.2 after the upgrade.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
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
