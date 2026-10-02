/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/features/api/query-keys";
import type {
  Node,
  NodeDaemonAgentConnection,
  NodeDaemonHarness,
} from "@/features/api/types";
import { ConnectionOnboarding } from "./connection-onboarding";

const mac: Node = { node_id: "mac", name: "Kevin’s Mac", online: true };
let nodes: Node[];
let inventory: NodeDaemonHarness[];
let connection: NodeDaemonAgentConnection | undefined;
let expiresAt: string;
let discoveryError: boolean;
let createError: boolean;
let requests: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}[];
let clients: QueryClient[];

beforeEach(() => {
  nodes = [];
  inventory = [
    {
      harness: "codex",
      state: "available",
      command: ["npx", "-y", "@agentclientprotocol/codex-acp"],
    },
  ];
  connection = undefined;
  expiresAt = new Date(Date.now() + 3600_000).toISOString();
  discoveryError = false;
  createError = false;
  requests = [];
  clients = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method, body });
      let data;
      if (path.endsWith("/node-registration-tokens")) {
        data = { token: "one-use-secret", expires_at: expiresAt };
      } else if (path.endsWith("/nodes")) {
        data = { nodes };
      } else if (path.endsWith("/harnesses/discover")) {
        data = discoveryError
          ? { error: { message: "Computer unavailable" } }
          : { harnesses: { items: inventory } };
      } else if (path.endsWith("/restart")) {
        data = {
          command_id: "retry",
          connection_id: "connection",
          desired_generation: 3,
        };
      } else if (path.includes("/agent-connections")) {
        if (method === "POST") {
          if (createError)
            return Response.json({ message: "Response lost" }, { status: 502 });
          connection = {
            id: "connection",
            agent_type: "codex",
            harness: "codex",
            name: "Codex",
            cloud_agent_id: "agent",
            command: ["codex-acp"],
            desired_acp_slots: 2,
            desired_state: "running",
            enabled: true,
            generation: 2,
            instance_id: "default",
            remote_id: "remote",
            restart_nonce: 0,
            status: {
              connection_id: "connection",
              phase: "running",
              observed_generation: 1,
              observed_restart_nonce: 0,
            },
          };
          data = {
            command_id: "create",
            command_status: "received",
            connection_id: "connection",
            agent_id: "agent",
            desired_generation: 2,
          };
        } else {
          data = {
            agent_connections: { items: connection ? [connection] : [] },
          };
        }
      } else throw new Error(`Unexpected request: ${method} ${path}`);
      return Response.json({ code: 200, data });
    }),
  );
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

function setup(
  props: Partial<React.ComponentProps<typeof ConnectionOnboarding>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConnectionOnboarding userId="user" {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { client, user: userEvent.setup() };
}

async function refresh(client: QueryClient, key: readonly string[]) {
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
}

describe("device connection", () => {
  it("offers device setup when the account only has CLI login identities", async () => {
    nodes = [
      { node_id: "cli", kind: "paxl", name: "CLI identity", online: false },
    ];
    setup();
    expect(
      await screen.findByRole("button", { name: "Generate command" }),
    ).toBeVisible();
    expect(screen.queryByText("CLI identity")).not.toBeInTheDocument();
  });

  it("keeps the command visible when a device appears and continues only with the chosen online computer", async () => {
    const { user, client } = setup();
    await user.click(
      await screen.findByRole("button", { name: "Generate command" }),
    );
    expect(
      await screen.findByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toBeVisible();
    nodes = [
      { ...mac, online: false },
      {
        node_id: "cli-online",
        kind: "paxl",
        name: "CLI identity",
        online: true,
      },
    ];
    await refresh(client, queryKeys.nodes("user"));
    expect(
      screen.queryByRole("button", { name: /Continue with/ }),
    ).not.toBeInTheDocument();
    nodes = [mac];
    await refresh(client, queryKeys.nodes("user"));
    expect(
      screen.getByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: /Continue with Kevin/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Choose your agent" }),
    ).toBeVisible();
    expect(screen.queryByText(/one-use-secret/)).not.toBeInTheDocument();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("one-use-secret");
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      "one-use-secret",
    );
  });

  it("supports browser sign-in from a fresh computer without generating a registration token", async () => {
    const { user, client } = setup();
    await user.click(
      await screen.findByRole("button", { name: "Browser sign-in" }),
    );
    expect(
      await screen.findByText(/PAX_REGISTRATION_TOKEN=''/),
    ).toHaveTextContent("PAX_SETUP_AFTER_INSTALL=1");
    expect(
      requests.some((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toBe(false);
    nodes = [mac];
    await refresh(client, queryKeys.nodes("user"));
    await user.click(
      await screen.findByRole("button", { name: /Continue with Kevin/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Choose your agent" }),
    ).toBeVisible();
  });

  it("hides expired secrets and lets the user generate a fresh command", async () => {
    expiresAt = new Date(Date.now() - 1000).toISOString();
    const { user } = setup();
    await user.click(
      await screen.findByRole("button", { name: "Generate command" }),
    );
    expect(await screen.findByText(/This command has expired/)).toBeVisible();
    expect(screen.queryByText(/one-use-secret/)).not.toBeInTheDocument();
    expiresAt = new Date(Date.now() + 3600_000).toISOString();
    await user.click(
      screen.getByRole("button", { name: "Generate new command" }),
    );
    expect(
      await screen.findByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toBeVisible();
  });
});

describe("agent connection", () => {
  it("requires a computer choice when more than one exists and never probes an offline computer", async () => {
    nodes = [mac, { node_id: "linux", name: "Linux", online: false }];
    const { user } = setup({ intent: "agent" });
    const select = await screen.findByRole("combobox", {
      name: /Which computer/,
    });
    expect(requests.some((request) => request.path.includes("/daemon/"))).toBe(
      false,
    );
    await user.selectOptions(select, "linux");
    expect(await screen.findByText(/Bring it online/)).toBeVisible();
    expect(requests.some((request) => request.path.includes("/daemon/"))).toBe(
      false,
    );
    await user.selectOptions(select, "mac");
    await waitFor(() =>
      expect(
        requests.some((request) =>
          request.path.includes("/nodes/mac/daemon/harnesses/discover"),
        ),
      ).toBe(true),
    );
  });

  it("uses the node-specific entry point and offers adapter installation without claiming the agent is missing", async () => {
    nodes = [mac, { node_id: "other", online: true }];
    inventory = [
      { harness: "codex", state: "missing", command: ["codex-acp"] },
    ];
    const { user } = setup({ intent: "agent", initialNodeId: "mac" });
    await user.click(await screen.findByRole("button", { name: "Codex" }));
    expect(await screen.findByText("ACP adapter needed")).toBeVisible();
    expect(
      screen.getByText("npm install -g @agentclientprotocol/codex-acp"),
    ).toBeVisible();
    expect(
      screen.getByText(/Agent installation and sign-in aren’t checked here/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Connect Codex" }),
    ).not.toBeInTheDocument();
    inventory = [
      { harness: "codex", state: "available", command: ["codex-acp"] },
    ];
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Connection command found")).toBeVisible();
    expect(screen.getByRole("button", { name: "Connect Codex" })).toBeEnabled();
  });

  it("explains npx fallback and waits for the requested runtime generation, not the command ACK", async () => {
    nodes = [mac];
    const { user, client } = setup();
    await user.click(await screen.findByRole("button", { name: "Codex" }));
    expect(await screen.findByText(/PAX found npx/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Connect Codex" }));
    expect(await screen.findByText("Connecting Codex…")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Start a conversation" }),
    ).not.toBeInTheDocument();
    connection!.status!.observed_generation = 2;
    await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
    expect(
      await screen.findByRole("heading", { name: "Codex is connected" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Start a conversation" }),
    ).toHaveAttribute("href", "/sessions/new?agentId=agent&nodeId=mac");
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          request.path.endsWith("/agent-connections"),
      ),
    ).toHaveLength(1);
    nodes = [{ ...mac, online: false }];
    await refresh(client, queryKeys.nodes("user"));
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Start a conversation" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("retries the failed connection instead of creating a duplicate", async () => {
    nodes = [mac];
    const { user, client } = setup();
    await user.click(await screen.findByRole("button", { name: "Codex" }));
    await user.click(
      await screen.findByRole("button", { name: "Connect Codex" }),
    );
    await screen.findByText("Connecting Codex…");
    connection!.status = {
      ...connection!.status!,
      phase: "failed",
      observed_generation: 2,
      last_error_message: "Sign in required",
    };
    await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
    expect(await screen.findByText("Sign in required")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry connection" }));
    await waitFor(() =>
      expect(
        requests.some((request) =>
          request.path.endsWith("/connection/restart"),
        ),
      ).toBe(true),
    );
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          request.path.endsWith("/agent-connections"),
      ),
    ).toHaveLength(1);
    connection!.status = {
      ...connection!.status!,
      phase: "running",
      observed_generation: 3,
      observed_restart_nonce: 1,
    };
    await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
    expect(
      await screen.findByRole("link", { name: "Start a conversation" }),
    ).toBeVisible();
  });

  it("does not turn a daemon error into a missing adapter result", async () => {
    nodes = [mac];
    discoveryError = true;
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Codex" }));
    expect(await screen.findByText(/Computer unavailable/)).toBeVisible();
    expect(screen.queryByText("ACP adapter needed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("does not blindly resubmit a creation whose response was lost", async () => {
    nodes = [mac];
    createError = true;
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Codex" }));
    await user.click(
      await screen.findByRole("button", { name: "Connect Codex" }),
    );
    expect(
      await screen.findByText(/The request may have reached/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Connect Codex" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Manage connections" }),
    ).toHaveAttribute("href", "/nodes/mac");
  });
});
