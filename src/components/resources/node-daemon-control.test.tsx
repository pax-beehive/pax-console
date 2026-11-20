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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeDaemonAgentConnection } from "@/features/api/types";
import { NodeDaemonControl } from "./node-daemon-control";

const connection: NodeDaemonAgentConnection = {
  id: "conn_current",
  cloud_agent_id: "agent_current",
  agent_type: "pi",
  command: ["pi"],
  desired_acp_slots: 2,
  desired_state: "running",
  enabled: true,
  generation: 1,
  harness: "pi",
  instance_id: "default",
  name: "Current agent",
  remote_id: "remote_1",
  restart_nonce: 0,
  status: {
    connection_id: "conn_current",
    observed_generation: 1,
    observed_restart_nonce: 0,
    phase: "running",
  },
};

let connections: NodeDaemonAgentConnection[];
let requests: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}[];
let patchError: boolean;
// What paxd did with a command, as Manager reports it inside its 202 answer.
let commandOutcome: "accepted" | "undelivered" | "rejected";
const refusedCommands: Record<string, Record<string, unknown>> = {
  undelivered: {
    command_id: "command_lost",
    dispatch_error: "node control tunnel disconnected",
    dispatch_status: "unknown",
  },
  rejected: {
    command_ack: {
      error: { code: "conflict", message: "agent connection name exists" },
      ok: false,
      status: "rejected",
    },
    command_id: "command_refused",
    command_status: "rejected",
    dispatch_status: "acknowledged",
  },
};

beforeEach(() => {
  connections = [
    {
      ...connection,
      id: "conn_other",
      cloud_agent_id: "agent_other",
      name: "Other agent",
    },
    { ...connection },
  ];
  requests = [];
  patchError = false;
  commandOutcome = "accepted";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method, body });
      let data;
      if (
        commandOutcome !== "accepted" &&
        (method === "DELETE" || method === "PATCH")
      ) {
        data = refusedCommands[commandOutcome];
      } else if (method === "DELETE") {
        const id = path.split("/").at(-1);
        connections = connections.map((item) =>
          item.id === id
            ? { ...item, enabled: false, desired_state: "deleted" }
            : item,
        );
        data = { command_id: "command_remove", command_status: "received" };
      } else if (method === "PATCH") {
        if (patchError)
          return Response.json(
            { message: "Node unavailable" },
            { status: 503 },
          );
        connections = connections.map((item) =>
          item.id === "conn_current"
            ? {
                ...item,
                desired_acp_slots: body.desired_slots,
                generation: 2,
                status: { ...item.status!, observed_generation: 2 },
              }
            : item,
        );
        data = {
          command_id: "command_1",
          command_status: "received",
          desired_generation: 2,
        };
      } else if (path.includes("/daemon/status")) {
        data = { status: { phase: "running" } };
      } else if (path.includes("/daemon/harnesses")) {
        data = {
          harnesses: {
            items: [{ harness: "pi", state: "available", command: ["pi"] }],
          },
        };
      } else if (path.includes("/daemon/agent-connections")) {
        data = { agent_connections: { items: connections } };
      } else {
        throw new Error(`Unexpected request: ${path}`);
      }
      return Response.json({ data });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderControl(agentId?: string, onAgentRemoved?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NodeDaemonControl
          agentId={agentId}
          nodeId="node_1"
          onAgentRemoved={onAgentRemoved}
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("agent-scoped runtime settings", () => {
  it("shows only the selected agent and saves slots to its daemon connection", async () => {
    const user = userEvent.setup();
    renderControl("agent_current");
    expect(await screen.findByText("Current agent")).toBeVisible();
    expect(screen.queryByText("Other agent")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discover" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Advanced setup" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Harness inventory")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit settings" }));
    const slots = screen.getByRole("spinbutton", { name: "Slots" });
    expect(slots).toHaveValue(2);
    await user.clear(slots);
    await user.type(slots, "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByText("runtime running")).toBeVisible(),
    );
    expect(requests.filter((request) => request.method === "PATCH")).toEqual([
      expect.objectContaining({
        path: expect.stringContaining(
          "/nodes/node_1/daemon/agent-connections/conn_current",
        ),
        body: expect.objectContaining({ desired_slots: 4 }),
      }),
    ]);
    expect(screen.getByText(/4 desired slots/)).toBeVisible();
  });

  it("does not fall back to another connection when the cloud agent is unmatched", async () => {
    renderControl("agent_missing");
    expect(
      await screen.findByText(
        /No paxd-managed connection is linked to this agent/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit settings" }),
    ).not.toBeInTheDocument();
  });

  it("keeps node-wide discovery and all connections available without an agent scope", async () => {
    renderControl();
    expect(await screen.findByText("Other agent")).toBeVisible();
    expect(screen.getByText("Current agent")).toBeVisible();
    expect(screen.getByRole("button", { name: "Discover" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Advanced setup" }),
    ).toBeVisible();
    expect(screen.getByText("Harness inventory")).toBeVisible();
  });

  it("hides deleted history while retaining stopped connections", async () => {
    connections = [
      {
        ...connection,
        id: "deleted",
        name: "Deleted history",
        desired_state: "deleted",
        enabled: false,
      },
      {
        ...connection,
        id: "stopped",
        name: "Stopped connection",
        desired_state: "stopped",
        enabled: false,
      },
    ];
    renderControl();
    expect(await screen.findByText("Stopped connection")).toBeVisible();
    expect(screen.queryByText("Deleted history")).not.toBeInTheDocument();
    expect(screen.getByText("1 connections")).toBeVisible();
  });

  it("confirms removal and finishes when paxd retains a deleted history row", async () => {
    const user = userEvent.setup();
    const onAgentRemoved = vi.fn();
    renderControl("agent_current", onAgentRemoved);
    await user.click(
      await screen.findByRole("button", { name: "Remove daemon connection" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Remove daemon connection?" }),
    ).toHaveTextContent(
      "This asks paxd to delete the local connection for Current agent. Its agent is removed from PAX as well.",
    );
    expect(
      requests.filter((request) => request.method === "DELETE"),
    ).toHaveLength(0);
    expect(onAgentRemoved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove connection" }));
    expect(
      await screen.findByText("runtime removed", {}, { timeout: 3000 }),
    ).toBeVisible();
    expect(screen.queryByText("Current agent")).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === "DELETE")).toEqual([
      expect.objectContaining({
        path: expect.stringContaining("/agent-connections/conn_current"),
      }),
    ]);
    // The device removed the connection, so PAX deletes the agent with it.
    expect(onAgentRemoved).toHaveBeenCalledTimes(1);
  });

  it("says that a connection without an agent leaves PAX unchanged", async () => {
    connections = [{ ...connection, cloud_agent_id: undefined }];
    const user = userEvent.setup();
    renderControl();
    await user.click(
      await screen.findByRole("button", { name: "Remove daemon connection" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Remove daemon connection?" }),
    ).toHaveTextContent(
      "This asks paxd to delete the local connection for Current agent. It is not linked to an agent in PAX.",
    );
  });

  it("keeps the removal dialog open and says so when the command did not reach the device", async () => {
    commandOutcome = "undelivered";
    const user = userEvent.setup();
    const onAgentRemoved = vi.fn();
    renderControl("agent_current", onAgentRemoved);
    await user.click(
      await screen.findByRole("button", { name: "Remove daemon connection" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove connection" }));

    const dialog = screen.getByRole("dialog", {
      name: "Remove daemon connection?",
    });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "PAX could not confirm that the device received this. Check that the device is online, then try again.",
    );
    // Nothing is treated as under way: no command to follow, no agent removed.
    expect(screen.queryByText("Last command")).not.toBeInTheDocument();
    expect(screen.queryByText("runtime reconciling")).not.toBeInTheDocument();
    expect(screen.queryByText("runtime removed")).not.toBeInTheDocument();
    expect(onAgentRemoved).not.toHaveBeenCalled();

    // Asking again starts without the old failure.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Current agent")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove daemon connection" }),
    );
    expect(
      within(
        screen.getByRole("dialog", { name: "Remove daemon connection?" }),
      ).queryByRole("alert"),
    ).not.toBeInTheDocument();
  });

  it("reports a change the device refused and keeps the form editable", async () => {
    commandOutcome = "rejected";
    const user = userEvent.setup();
    renderControl("agent_current");
    await user.click(
      await screen.findByRole("button", { name: "Edit settings" }),
    );
    const slots = screen.getByRole("spinbutton", { name: "Slots" });
    await user.clear(slots);
    await user.type(slots, "4");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "The device did not accept this: agent connection name exists",
      ),
    ).toBeVisible();
    expect(slots).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByText("Last command")).not.toBeInTheDocument();
  });

  it("blocks invalid slots and keeps the form editable after a failed save", async () => {
    patchError = true;
    const user = userEvent.setup();
    renderControl("agent_current");
    await user.click(
      await screen.findByRole("button", { name: "Edit settings" }),
    );
    const slots = screen.getByRole("spinbutton", { name: "Slots" });
    for (const value of ["0", "17", "1.5"]) {
      await user.clear(slots);
      await user.type(slots, value);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    }
    await user.clear(slots);
    await user.type(slots, "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Node unavailable")).toBeVisible();
    expect(slots).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
