/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent, Node } from "@/features/api/types";
import { AgentSettingsDialog } from "./agent-settings-dialog";

const api = vi.hoisted(() => ({
  connections: [] as Record<string, unknown>[],
  updateProfile: vi.fn(async () => ({})),
  updateConnection: vi.fn(async () => ({})),
}));
vi.mock("@/features/api/resources", () => ({
  updateNodeAgentProfile: api.updateProfile,
  updateNodeDaemonAgentConnection: api.updateConnection,
  useNodeDaemonAgentConnections: (
    _userId: string,
    _nodeId: string | undefined,
    enabled: boolean,
  ) => ({
    data: enabled
      ? { agent_connections: { items: api.connections } }
      : undefined,
    isLoading: false,
  }),
}));

const agent: Agent = {
  agent_id: "agent_one",
  agent_type: "claude-code",
  description: "Reviews risky changes",
  name: "reviewer",
  node_id: "node_one",
};
const connection = {
  cloud_agent_id: "agent_one",
  desired_acp_slots: 2,
  harness: "claude-code",
  id: "conn_one",
  name: "default",
  report_local_sessions: false,
  working_dir: "/tmp",
};

function open(node: Node) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AgentSettingsDialog
        agent={agent}
        node={node}
        onClose={onClose}
        userId="user_1"
      />
    </QueryClientProvider>,
  );
  return onClose;
}

afterEach(() => {
  cleanup();
  api.connections = [];
  vi.clearAllMocks();
});

describe("agent settings", () => {
  it("saves the name and the two device settings, leaving the rest of the connection as it was", async () => {
    api.connections = [connection];
    const user = userEvent.setup();
    const onClose = open({ node_id: "node_one", name: "Laptop", online: true });

    expect(screen.getByText("Claude Code · Laptop")).toBeVisible();
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("reviewer");
    expect(
      screen.getByRole("switch", { name: "Sync local sessions" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(name);
    await user.type(name, "release reviewer");
    await user.click(
      screen.getByRole("switch", { name: "Sync local sessions" }),
    );
    await user.click(screen.getByText("Advanced"));
    const slots = screen.getByLabelText("Sessions running at the same time");
    await user.clear(slots);
    await user.type(slots, "4");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.updateProfile).toHaveBeenCalledWith(
      "user_1",
      "node_one",
      "agent_one",
      { description: "Reviews risky changes", name: "release reviewer" },
    );
    expect(api.updateConnection).toHaveBeenCalledWith(
      "user_1",
      "node_one",
      "conn_one",
      {
        desired_slots: 4,
        harness: "claude-code",
        name: "default",
        report_local_sessions: true,
        working_dir: "/tmp",
      },
    );
  });

  it("leaves the device settings alone while the device is offline", async () => {
    api.connections = [connection];
    const user = userEvent.setup();
    const onClose = open({ node_id: "node_one", online: false });

    expect(
      screen.getByRole("switch", { name: "Sync local sessions" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Syncing and the session limit can be changed when the device is online.",
      ),
    ).toBeVisible();
    await user.type(screen.getByLabelText("Description (optional)"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.updateProfile).toHaveBeenCalledOnce();
    expect(api.updateConnection).not.toHaveBeenCalled();
  });

  it("explains that an existing description stays when the field is emptied", async () => {
    const user = userEvent.setup();
    open({ node_id: "node_one", online: false });

    await user.clear(screen.getByLabelText("Description (optional)"));
    expect(
      screen.getByText(
        "A description cannot be removed yet. The current one stays until you replace it.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("requires a name and a session limit between 1 and 16", async () => {
    api.connections = [connection];
    const user = userEvent.setup();
    open({ node_id: "node_one", online: true });

    await user.click(screen.getByText("Advanced"));
    const slots = screen.getByLabelText("Sessions running at the same time");
    await user.clear(slots);
    await user.type(slots, "17");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(slots);
    await user.type(slots, "3");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
