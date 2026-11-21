/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocaleStore } from "@/features/i18n/locale-store";
import { queryKeys } from "@/features/api/query-keys";
import type {
  HostedSandboxStatus,
  HostedStarterStatus,
  Node,
  NodeDaemonAgentConnection,
  NodeDaemonHarness,
} from "@/features/api/types";
import { ConnectionOnboarding } from "./connection-onboarding";
import { HostedSandboxCreate } from "./hosted-sandbox-create";

const mac: Node = { node_id: "mac", name: "Kevin’s Mac", online: true };
let nodes: Node[];
let inventory: NodeDaemonHarness[];
let connection: NodeDaemonAgentConnection | undefined;
let expiresAt: string;
let discoveryError: boolean;
let createError: boolean;
let hostedSandbox: HostedSandboxStatus | undefined;
let sandboxStartError: boolean;
let sandboxReadError: boolean;
let hostedStarter: HostedStarterStatus | undefined;
let starterError: boolean;
let wakeError: boolean;
let requests: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}[];
let clients: QueryClient[];

function connectionFixture(
  harness: string,
  name: string,
  observed: number,
): NodeDaemonAgentConnection {
  return {
    id: "connection",
    agent_type: harness,
    harness,
    name,
    cloud_agent_id: "agent",
    command: [`${harness}-acp`],
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
      observed_generation: observed,
      observed_restart_nonce: 0,
    },
  };
}

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
  hostedSandbox = undefined;
  sandboxStartError = false;
  sandboxReadError = false;
  hostedStarter = undefined;
  starterError = false;
  wakeError = false;
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
      } else if (/\/sandbox(?:\/(?:resume|restart))?$/.test(path)) {
        if (!hostedSandbox) return Response.json({}, { status: 404 });
        if (method === "POST") {
          if (sandboxStartError) return Response.json({}, { status: 503 });
          hostedSandbox = {
            sandbox: { ...hostedSandbox.sandbox, status: "queued" },
          };
        } else if (sandboxReadError) {
          return Response.json({}, { status: 503 });
        }
        data = hostedSandbox;
      } else if (path.endsWith("/starter")) {
        if (starterError)
          return Response.json({ message: "Unavailable" }, { status: 503 });
        if (!hostedStarter)
          return Response.json({ message: "Unavailable" }, { status: 404 });
        data = hostedStarter;
      } else if (path.endsWith("/starter/wake") && hostedStarter) {
        if (wakeError)
          return Response.json({ message: "Unavailable" }, { status: 503 });
        const awsAccess = hostedStarter.sandbox_model_access;
        if (awsAccess && awsAccess.node_id === body?.node_id) {
          awsAccess.state = "queued";
          awsAccess.agent_id = String(body?.agent_id);
          data = hostedStarter;
        } else if (hostedStarter.starter) {
          hostedStarter.starter.state = "queued";
          hostedStarter.starter.agent_id = String(body?.agent_id);
          data = {
            ...hostedStarter,
            starter: { ...hostedStarter.starter, state: "ready" },
          };
        } else return Response.json({}, { status: 404 });
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
          connection = connectionFixture(
            String(body?.harness),
            String(body?.name),
            1,
          );
          if (createError)
            return Response.json({ message: "Response lost" }, { status: 502 });
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
  useLocaleStore.setState({ locale: "en" });
  clients.forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

function setup(
  props: Partial<React.ComponentProps<typeof ConnectionOnboarding>> = {},
  manageSandbox = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {manageSandbox ? (
          <HostedSandboxCreate userId="user" dedicated />
        ) : (
          <ConnectionOnboarding userId="user" {...props} />
        )}
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { client, user: userEvent.setup() };
}

const sandboxPath = "/api/pax/api/v1/sandbox";

describe("hosted sandbox creation", () => {
  it("keeps Add device focused on pairing even for a sandbox-eligible owner", () => {
    hostedSandbox = { sandbox: null };
    setup({ intent: "device" });
    expect(requests.some(({ path }) => path === sandboxPath)).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Create sandbox" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quick connect (Recommended)" }),
    ).toBeEnabled();
  });

  it("queues once, polls for the exact Node, and leaves agent selection to the user", async () => {
    nodes = [mac];
    hostedSandbox = { sandbox: null };
    const { client, user } = setup({}, true);

    await user.dblClick(
      await screen.findByRole("button", { name: "Create sandbox" }),
    );
    expect(
      await screen.findByText("Sandbox queued. Waiting for a host…"),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add agent" })).toBeNull();

    hostedSandbox = {
      sandbox: { status: "queued", reason_code: "waiting_for_capacity" },
    };
    await refresh(client, queryKeys.hostedSandbox("user"));
    expect(
      await screen.findByText(
        "The sandbox host is full. Waiting for an available slot…",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Starting sandbox…")).toBeNull();

    hostedSandbox = { sandbox: { status: "starting" } };
    await refresh(client, queryKeys.hostedSandbox("user"));
    expect(await screen.findByText("Starting sandbox…")).toBeVisible();

    nodes = [...nodes, { node_id: "sandbox-node", online: true }];
    hostedSandbox = { sandbox: { status: "ready", node_id: "sandbox-node" } };
    expect(
      await screen.findByText("Sandbox connected", undefined, {
        timeout: 4000,
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open device" })).toHaveAttribute(
      "href",
      "/nodes/sandbox-node",
    );
    expect(screen.getByRole("link", { name: "Add agent" })).toHaveAttribute(
      "href",
      "/settings/devices/agents/add?nodeId=sandbox-node",
    );
    expect(requests.filter(({ method }) => method === "POST")).toEqual([
      { path: sandboxPath, method: "POST" },
    ]);
    expect(
      requests.some(({ path }) => path.includes("/harnesses/discover")),
    ).toBe(false);
  });

  it("lets the user retry a failed start of a saved sandbox", async () => {
    sandboxStartError = true;
    hostedSandbox = {
      sandbox: { status: "sleeping", node_id: "sandbox-node" },
    };
    const { user } = setup({}, true);
    await user.click(
      await screen.findByRole("button", { name: "Start sandbox" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not confirm the sandbox start request.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sandbox start request",
    );

    sandboxStartError = false;
    await user.click(screen.getByRole("button", { name: "Start sandbox" }));
    expect(
      await screen.findByText("Sandbox queued. Waiting for a host…"),
    ).toBeVisible();
    expect(requests.filter(({ method }) => method === "POST")).toEqual(
      [0, 1].map(() => ({
        path: sandboxPath + "/resume",
        method: "POST",
        body: { node_id: "sandbox-node" },
      })),
    );
  });

  it.each([
    [
      "host_environment_limit",
      "Sandbox host capacity",
      "The sandbox host has reached its limit for saved sandboxes.",
    ],
    [
      "container_exited",
      "Sandbox container startup",
      "The sandbox stopped before its device connected.",
    ],
    [
      "node_connection_timeout",
      "Sandbox device connection",
      "The sandbox device did not connect in time.",
    ],
    [undefined, "Sandbox startup", "Could not start the sandbox. Try again."],
    [
      "unrecognized-host-error",
      "Sandbox startup",
      "Could not start the sandbox. Try again.",
    ],
  ])(
    "shows an actionable error for a failed sandbox (%s)",
    async (reason, stage, message) => {
      hostedSandbox = { sandbox: { status: "failed", reason_code: reason } };
      setup({}, true);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(stage);
      expect(alert).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.queryByText("unrecognized-host-error")).toBeNull();
    },
  );

  it("offers a refresh if a previously ready sandbox cannot be confirmed", async () => {
    nodes = [...nodes, { node_id: "sandbox-node", online: true }];
    hostedSandbox = { sandbox: { status: "ready", node_id: "sandbox-node" } };
    const { client, user } = setup({}, true);
    expect(await screen.findByText("Sandbox connected")).toBeVisible();

    sandboxReadError = true;
    await refresh(client, queryKeys.hostedSandbox("user"));
    expect(
      await screen.findByText("Could not confirm sandbox status."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open device" })).toBeNull();

    sandboxReadError = false;
    await user.click(
      screen.getByRole("button", { name: "Refresh sandbox status" }),
    );
    expect(
      await screen.findByRole("link", { name: "Open device" }),
    ).toBeVisible();
  });
  it("restarts the exact reported offline Node and generation", async () => {
    nodes = [{ node_id: "sandbox-node", online: false }];
    hostedSandbox = {
      sandbox: { status: "ready", node_id: "sandbox-node", generation: 8 },
    };
    const { user } = setup({}, true);
    await user.click(
      await screen.findByRole("button", { name: "Restart sandbox" }),
    );
    await screen.findByText("Sandbox queued. Waiting for a host…");
    expect(requests.filter(({ method }) => method === "POST")).toEqual([
      {
        path: sandboxPath + "/restart",
        method: "POST",
        body: { node_id: "sandbox-node", generation: 8 },
      },
    ]);
  });

  it("offers refresh while the sandbox device status is missing", async () => {
    hostedSandbox = {
      sandbox: { status: "ready", node_id: "sandbox-node", generation: 8 },
    };
    setup({}, true);
    await screen.findByText("Waiting for the sandbox device to reconnect…");
    expect(
      screen.queryByRole("button", { name: "Restart sandbox" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Refresh sandbox status" }),
    ).toBeEnabled();
  });
});

async function refresh(client: QueryClient, key: readonly string[]) {
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
}

describe("device connection", () => {
  it("starts quick connect directly and reuses its displayed command on repeat clicks", async () => {
    const { user } = setup();
    const quick = await screen.findByRole("button", {
      name: "Quick connect (Recommended)",
    });
    expect(quick).not.toHaveAttribute("aria-pressed");
    expect(
      screen.queryByRole("button", { name: "Generate command" }),
    ).not.toBeInTheDocument();
    expect(
      requests.filter((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toHaveLength(0);
    await user.dblClick(quick);
    expect(
      await screen.findByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toBeVisible();
    await user.click(quick);
    expect(
      requests.filter((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toHaveLength(1);
  });

  it("generates the recommended command when switching back from browser sign-in", async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole("button", { name: "Browser sign-in" }),
    );
    expect(await screen.findByText(/PAX_REGISTRATION_TOKEN=''/)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Quick connect (Recommended)" }),
    );
    expect(
      await screen.findByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toBeVisible();
    expect(
      requests.filter((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toHaveLength(1);
  });

  it("offers device setup when the account only has CLI login identities", async () => {
    nodes = [
      { node_id: "cli", kind: "paxl", name: "CLI identity", online: false },
    ];
    setup();
    expect(
      await screen.findByRole("button", {
        name: "Quick connect (Recommended)",
      }),
    ).toBeVisible();
    expect(screen.queryByText("CLI identity")).not.toBeInTheDocument();
  });

  it("keeps the command visible when a device appears and continues only with the chosen online computer", async () => {
    const { user, client } = setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Quick connect (Recommended)",
      }),
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

  it("offers a short setup command without regenerating the token", async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Quick connect (Recommended)",
      }),
    );
    await screen.findByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/);
    await user.click(
      screen.getByRole("checkbox", {
        name: "PAX is already installed on this computer",
      }),
    );
    const command = screen.getByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/);
    expect(command).toHaveTextContent("paxd setup --cloud-url");
    expect(command).toHaveTextContent("--registration-token-env");
    expect(command).not.toHaveTextContent("curl");
    expect(
      requests.filter((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("checkbox", {
        name: "PAX is already installed on this computer",
      }),
    );
    expect(
      screen.getByText(/PAX_REGISTRATION_TOKEN='one-use-secret'/),
    ).toHaveTextContent("curl");
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
      await screen.findByRole("button", {
        name: "Quick connect (Recommended)",
      }),
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
    ).toHaveAttribute("href", "/?agentId=agent");
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
    ).toHaveAttribute("href", "/settings/devices");
    connection = {
      ...connection!,
      status: { ...connection!.status!, observed_generation: 2 },
    };
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Codex is connected")).toBeVisible();
    expect(
      requests.filter(
        ({ path, method }) =>
          method === "POST" && path.includes("/agent-connections"),
      ),
    ).toHaveLength(1);
  });
});

it("offers AWS sandbox quota during Codex onboarding after the Agent is connected", async () => {
  nodes = [mac];
  hostedStarter = {
    enabled: true,
    sandbox_model_access: {
      node_id: "mac",
      harnesses: ["codex"],
      state: "available",
    },
  };
  const { user, client } = setup();
  await user.click(await screen.findByRole("button", { name: "Codex" }));
  const connect = await screen.findByRole("button", { name: "Connect Codex" });
  await waitFor(() => expect(connect).toBeEnabled());
  await user.click(connect);
  expect(await screen.findByText("Connecting Codex…")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();

  connection!.status!.observed_generation = 2;
  await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
  expect(
    await screen.findByRole("link", { name: "Start a conversation" }),
  ).toBeVisible();
  const quota = await screen.findByRole("button", {
    name: "Use Pax free quota",
  });
  expect(
    requests.filter(({ path }) => path.endsWith("/starter/wake")),
  ).toHaveLength(0);
  await user.click(quota);
  expect(
    await screen.findByText("Setting up free model access…"),
  ).toBeVisible();
  expect(requests.filter(({ path }) => path.endsWith("/starter/wake"))).toEqual(
    [
      {
        path: "/api/pax/api/v1/starter/wake",
        method: "POST",
        body: { node_id: "mac", agent_id: "agent" },
      },
    ],
  );

  hostedStarter.sandbox_model_access!.state = "ready";
  await refresh(client, queryKeys.hostedStarter("user"));
  expect(await screen.findByText("Pax free quota is ready.")).toBeVisible();
});

describe("free model access for enrolled Pi", () => {
  beforeEach(() => {
    nodes = [mac];
    inventory = [
      {
        harness: "pi",
        display_name: "Pi",
        state: "available",
        command: ["pi-acp"],
      },
    ];
    hostedStarter = {
      enabled: true,
      enrolled_node: true,
      pool_available: true,
      user_budget_available: true,
      starter: {
        node_id: "mac",
        state: "sleeping",
      },
    };
  });

  const wakeRequests = () =>
    requests.filter(({ path }) => path.endsWith("/starter/wake"));

  async function choosePi(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("button", { name: "Pi" }));
  }

  it("keeps Pi creation independent and activates free quota only after an explicit click", async () => {
    const { user, client } = setup();
    await choosePi(user);
    const connect = await screen.findByRole("button", { name: "Connect Pi" });
    await waitFor(() => expect(connect).toBeEnabled());
    await user.click(connect);
    expect(await screen.findByText("Connecting Pi…")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Use Pax free quota" }),
    ).not.toBeInTheDocument();
    expect(wakeRequests()).toHaveLength(0);

    connection!.status!.observed_generation = 2;
    await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
    const conversation = await screen.findByRole("link", {
      name: "Start a conversation",
    });
    expect(conversation).toHaveAttribute("href", "/?agentId=agent");
    const activate = await screen.findByRole("button", {
      name: "Use Pax free quota",
    });
    expect(wakeRequests()).toHaveLength(0);
    await user.dblClick(activate);
    expect(
      await screen.findByText("Setting up free model access…"),
    ).toBeVisible();
    await waitFor(() =>
      expect(wakeRequests()).toEqual([
        {
          path: "/api/pax/api/v1/starter/wake",
          method: "POST",
          body: { node_id: "mac", agent_id: "agent" },
        },
      ]),
    );
    expect(conversation).toBeVisible();
    expect(
      screen.queryByText("Pax free quota is ready."),
    ).not.toBeInTheDocument();

    hostedStarter!.starter!.state = "ready";
    await refresh(client, queryKeys.hostedStarter("user"));
    expect(await screen.findByText("Pax free quota is ready.")).toBeVisible();

    hostedStarter!.starter!.state = "sleeping";
    await refresh(client, queryKeys.hostedStarter("user"));
    expect(
      await screen.findByRole("button", { name: "Use Pax free quota" }),
    ).toBeVisible();
    expect(wakeRequests()).toHaveLength(1);
  });

  it("reuses a running Pi and only enables its free models after confirmation", async () => {
    connection = connectionFixture("pi", "Pi already connected", 2);
    const { user, client } = setup();
    await choosePi(user);
    await user.click(
      await screen.findByRole("button", {
        name: "Use existing agent: Pi already connected",
      }),
    );
    expect(wakeRequests()).toHaveLength(0);
    const enable = await screen.findByRole("button", {
      name: "Use Pax free quota",
    });
    await user.click(enable);
    await waitFor(() => expect(wakeRequests()).toHaveLength(1));
    expect(
      requests.filter(
        ({ path, method }) =>
          path.endsWith("/agent-connections") && method === "POST",
      ),
    ).toHaveLength(0);

    hostedStarter!.starter!.state = "ready";
    hostedStarter!.starter!.agent_id = "another-agent";
    await refresh(client, queryKeys.hostedStarter("user"));
    expect(
      await screen.findByText(
        "Free model access is assigned to another agent in this sandbox.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Start a conversation" }),
    ).toBeVisible();

    hostedStarter!.starter!.agent_id = "agent";
    hostedStarter!.pool_available = false;
    await refresh(client, queryKeys.hostedStarter("user"));
    expect(
      await screen.findByText("The shared free model budget is exhausted."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Start a conversation" }),
    ).toBeVisible();

    hostedStarter!.pool_available = true;
    hostedStarter!.user_budget_available = false;
    await refresh(client, queryKeys.hostedStarter("user"));
    expect(
      await screen.findByText("Your free model budget is exhausted."),
    ).toBeVisible();
  });

  it("keeps the normal conversation available when the quota request fails and allows retry", async () => {
    connection = connectionFixture("pi", "Pi already connected", 2);
    wakeError = true;
    const { user } = setup();
    await choosePi(user);
    await user.click(
      await screen.findByRole("button", {
        name: "Use existing agent: Pi already connected",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Use Pax free quota" }),
    );
    expect(
      await screen.findByText("Couldn’t enable free model access."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Start a conversation" }),
    ).toBeVisible();

    wakeError = false;
    await user.click(
      screen.getByRole("button", { name: "Retry free model setup" }),
    );
    expect(
      await screen.findByText("Setting up free model access…"),
    ).toBeVisible();
    expect(wakeRequests()).toHaveLength(2);
  });

  it("shows the opt-in and personal provider instructions in Chinese", async () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    connection = connectionFixture("pi", "Pi 已连接", 2);
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "更多" }));
    await user.click(await screen.findByRole("button", { name: "Pi" }));
    await user.click(
      await screen.findByRole("button", { name: "使用现有智能体：Pi 已连接" }),
    );
    expect(await screen.findByRole("link", { name: "开始对话" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "使用 Pax 免费额度" }),
    ).toBeVisible();
    expect(screen.getByText(/在沙箱终端运行 pi，再输入 \/login/)).toBeVisible();
    expect(wakeRequests()).toHaveLength(0);
  });

  it.each([
    "no host enrollment",
    "different node",
    "feature unavailable",
    "starter API error",
  ])("keeps the normal Pi flow with %s", async (reason) => {
    if (reason === "no host enrollment") delete hostedStarter!.enrolled_node;
    if (reason === "different node")
      hostedStarter!.starter!.node_id = "other-node";
    if (reason === "feature unavailable") hostedStarter = undefined;
    if (reason === "starter API error") starterError = true;

    const { user, client } = setup();
    await choosePi(user);
    const connect = await screen.findByRole("button", { name: "Connect Pi" });
    await waitFor(() => expect(connect).toBeEnabled());
    await user.click(connect);
    expect(await screen.findByText("Connecting Pi…")).toBeVisible();
    connection!.status!.observed_generation = 2;
    await refresh(client, queryKeys.nodeDaemonAgentConnections("user", "mac"));
    expect(
      await screen.findByRole("link", { name: "Start a conversation" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Use Pax free quota" }),
    ).not.toBeInTheDocument();
    expect(wakeRequests()).toHaveLength(0);
  });
});

describe("Given the connection guide uses Chinese", () => {
  it("generates the same one-use terminal command through localized quick connect", async () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    const { user } = setup();
    expect(
      screen.getByRole("heading", { name: "连接你的第一个智能体" }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "快速连接（推荐）" }),
    );
    expect(await screen.findByText(/one-use-secret/)).toHaveTextContent(
      "one-use-secret",
    );
    expect(
      screen.getByRole("button", { name: "复制命令" }),
    ).toBeInTheDocument();
    expect(
      requests.filter((request) =>
        request.path.endsWith("/node-registration-tokens"),
      ),
    ).toHaveLength(1);
    expect(requests.some((request) => request.path.includes("连接"))).toBe(
      false,
    );
  });
});
