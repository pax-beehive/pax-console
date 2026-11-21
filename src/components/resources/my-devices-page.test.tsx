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
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/features/api/errors";
import type { Agent, HostedSandboxStatus, Node } from "@/features/api/types";
import { MyDevicesPage } from "./my-devices-page";

const api = vi.hoisted(() => ({
  nodes: [] as Record<string, unknown>[],
  agents: [] as Record<string, unknown>[],
  deleteNode: vi.fn(async () => ({})),
  deleteAgent: vi.fn(async () => ({})),
  updateNodeProfile: vi.fn(async () => ({})),
  readHostedSandbox: vi.fn(
    async (): Promise<HostedSandboxStatus | null> => null,
  ),
  resumeHostedSandbox: vi.fn(async () => ({ sandbox: null })),
  restartHostedSandbox: vi.fn(async () => ({ sandbox: null })),
}));
vi.mock("@/features/api/resources", async (original) => ({
  ...(await original<typeof import("@/features/api/resources")>()),
  deleteAgent: api.deleteAgent,
  deleteNode: api.deleteNode,
  getNodeHarnessAuth: async () => ({ harness_auth: { state: "idle" } }),
  readHostedSandbox: api.readHostedSandbox,
  resumeHostedSandbox: api.resumeHostedSandbox,
  restartHostedSandbox: api.restartHostedSandbox,
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
const named: Agent = {
  agent_id: "a1",
  agent_type: "claude-code",
  name: "cloud-code-pro",
  node_id: "node_laptop",
};

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
  api.readHostedSandbox.mockResolvedValue(null);
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
    expect(screen.queryByRole("link", { name: "My sandbox" })).toBeNull();
  });

  it.each([
    { status: "sleeping", label: "Start sandbox" },
    { status: "ready", label: "Restart sandbox" },
  ] as const)(
    "offers $label on the matching device when the sandbox is $status",
    async ({ status, label }) => {
      api.nodes = [
        { ...server, online: false },
        { ...laptop, online: false },
      ];
      api.readHostedSandbox.mockResolvedValue({
        sandbox: { status, node_id: server.node_id, generation: 4 },
      });
      const user = open();

      expect(
        await screen.findByRole("link", { name: "My sandbox" }),
      ).toHaveAttribute("href", "/sandbox");
      expect(
        within(screen.getByRole("article", { name: "Laptop" })).queryByRole(
          "button",
          { name: label },
        ),
      ).toBeNull();
      await user.click(
        within(screen.getByRole("article", { name: "Build server" })).getByRole(
          "button",
          { name: label },
        ),
      );

      if (status === "sleeping") {
        await waitFor(() =>
          expect(api.resumeHostedSandbox).toHaveBeenCalledExactlyOnceWith(
            server.node_id,
          ),
        );
        expect(api.restartHostedSandbox).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(api.restartHostedSandbox).toHaveBeenCalledExactlyOnceWith(
            server.node_id,
            4,
          ),
        );
        expect(api.resumeHostedSandbox).not.toHaveBeenCalled();
      }
    },
  );

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

  it("says what was deleted, until the next action starts", async () => {
    api.nodes = [laptop];
    api.agents = [named];
    const user = open();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Actions for cloud-code-pro" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete agent…" }));
    await user.click(screen.getByRole("button", { name: "Delete agent" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deleted cloud-code-pro.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Actions for Laptop" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete device…" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete device" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deleted Laptop.",
    );
  });

  it("keeps the dialog open and explains a delete that failed", async () => {
    api.nodes = [laptop];
    api.agents = [named];
    api.deleteAgent.mockRejectedValueOnce(
      new ApiError("node control tunnel is not connected", 503, undefined),
    );
    const user = open();

    await user.click(
      screen.getByRole("button", { name: "Actions for cloud-code-pro" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete agent…" }));
    await user.click(screen.getByRole("button", { name: "Delete agent" }));

    const dialog = screen.getByRole("dialog", { name: "Delete agent?" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "PAX is having trouble right now. Try again in a moment.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete agent" })).toBeEnabled();

    // Asking again starts clean and can succeed.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      screen.getByRole("button", { name: "Actions for cloud-code-pro" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete agent…" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deleted cloud-code-pro.",
    );
    expect(api.deleteAgent).toHaveBeenCalledTimes(2);
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
