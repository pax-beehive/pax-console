/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method, body });
      let data;
      if (method === "PATCH") {
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

function renderControl(agentId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NodeDaemonControl agentId={agentId} nodeId="node_1" userId="user_1" />
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
