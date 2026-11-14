/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Agent, Node } from "@/features/api/types";
import { MyDevicesPage } from "./my-devices-page";

const api = vi.hoisted(() => ({
  nodes: [] as Record<string, unknown>[],
  agents: [] as Record<string, unknown>[],
  deleteNode: vi.fn(async () => ({})),
  deleteAgent: vi.fn(async () => ({})),
  updateNodeProfile: vi.fn(async () => ({})),
}));
vi.mock("@/features/api/resources", async (original) => ({
  ...(await original<typeof import("@/features/api/resources")>()),
  deleteAgent: api.deleteAgent,
  deleteNode: api.deleteNode,
  getNodeHarnessAuth: async () => ({ harness_auth: { state: "idle" } }),
  updateNodeProfile: api.updateNodeProfile,
  useAgents: () => ({ data: { agents: api.agents }, isLoading: false }),
  useNodes: () => ({ data: { nodes: api.nodes }, isLoading: false }),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/devices",
}));

const laptop: Node = { node_id: "node_laptop", name: "Laptop", online: true };
const server: Node = { node_id: "node_server", name: "Build server" };
const agents: Agent[] = [
  { agent_id: "a1", agent_type: "claude-code", node_id: "node_laptop" },
  { agent_id: "a2", agent_type: "codex", node_id: "node_server" },
  { agent_id: "a3", agent_type: "codex", name: "stray" },
];

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <MyDevicesPage user={{ user_id: "user_1", role: "user" }} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  api.nodes = [];
  api.agents = [];
  vi.clearAllMocks();
});

describe("My devices", () => {
  it("lists each device with its own agents, online devices first, and keeps offline ones", () => {
    api.nodes = [
      server,
      laptop,
      { node_id: "cli", kind: "paxl", online: true },
    ];
    api.agents = agents;
    open();

    const cards = screen.getAllByTestId("device-card");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Laptop",
      "Build server",
    ]);
    expect(cards[0]).toHaveTextContent("Claude Code");
    expect(cards[1]).toHaveTextContent("Codex");
    expect(cards[1]).toHaveTextContent("offline");
    expect(
      screen.getByRole("region", { name: "Agents without a device" }),
    ).toHaveTextContent("stray");
    expect(screen.getByRole("link", { name: "Add device" })).toHaveAttribute(
      "href",
      "/settings/devices/add",
    );
  });

  it("points a new account at adding its first device", () => {
    open();
    expect(
      screen.getByRole("heading", { name: "No devices yet" }),
    ).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Add device" })).toHaveLength(2);
    expect(screen.queryByTestId("device-card")).not.toBeInTheDocument();
  });

  it("renames a device from its menu", async () => {
    api.nodes = [laptop];
    const user = open();
    await user.click(
      screen.getByRole("button", { name: "Actions for Laptop" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Rename…" }));

    const name = screen.getByRole("textbox", { name: "Device name" });
    expect(name).toHaveValue("Laptop");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Work laptop{Enter}");

    await waitFor(() =>
      expect(api.updateNodeProfile).toHaveBeenCalledWith(
        "user_1",
        "node_laptop",
        { name: "Work laptop" },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("asks before deleting a device or an agent", async () => {
    api.nodes = [laptop];
    api.agents = agents.slice(0, 1);
    const user = open();

    await user.click(
      screen.getByRole("button", { name: "Actions for Laptop" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete device…" }));
    expect(api.deleteNode).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "This removes Laptop from PAX, together with the agents that run on it.",
    );
    await user.click(screen.getByRole("button", { name: "Delete device" }));
    await waitFor(() =>
      expect(api.deleteNode).toHaveBeenCalledWith("user_1", "node_laptop"),
    );

    await user.click(
      screen.getByRole("button", { name: "Actions for Claude Code" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete agent…" }));
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await waitFor(() =>
      expect(api.deleteAgent).toHaveBeenCalledWith("user_1", "a1"),
    );
  });

  it("opens an agent's settings from its menu", async () => {
    api.nodes = [laptop];
    api.agents = agents.slice(0, 1);
    const user = open();
    await user.click(
      screen.getByRole("button", { name: "Actions for Claude Code" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Settings…" }));
    expect(
      screen.getByRole("dialog", { name: "Agent settings" }),
    ).toBeVisible();
  });
});
