/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Agent, DaemonCommandRecord, Node } from "@/features/api/types";
import { useLocaleStore } from "@/features/i18n/locale-store";
import { DeviceCard } from "./device-card";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/features/api/client", () => ({
  API_BASE_URL: "/api/pax",
  apiFetch: api.fetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  api.fetch.mockImplementation(async (path: string) => {
    if (path.includes("/daemon/commands/")) {
      return {
        command: {
          command_id: "cmd_paxl",
          error_message: "rename /usr/local/bin/paxl: permission denied",
          result: { phase: "failed" },
          status: "failed",
          type: "paxl.upgrade",
        },
        type: "command.get",
      };
    }
    if (path.includes("/auth/status"))
      return {
        harness_auth: {
          harness: path.includes("codex") ? "codex" : "claude-code",
          logged_in: !path.includes("codex"),
          state: "idle",
        },
      };
    if (path.includes("/daemon/agent-connections?"))
      return {
        agent_connections: {
          items: [{ cloud_agent_id: "agent_claude", id: "conn_claude" }],
        },
        type: "agent_connections.list",
      };
    return { platform: "linux/amd64", version: "0.1.62" };
  });
});

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
  vi.clearAllMocks();
  vi.useRealTimers();
});

function command(overrides: Partial<DaemonCommandRecord>): DaemonCommandRecord {
  return {
    command_id: "cmd_paxl",
    created_at: "2026-10-22T10:00:00Z",
    node_id: "node_ubuntu_23ca7f00018f68b",
    state: "in_progress",
    status: "received",
    target_version: "0.1.62",
    type: "paxl.upgrade",
    updated_at: "2026-10-22T10:00:00Z",
    ...overrides,
  };
}

function device(overrides: Partial<Node> = {}): Node {
  return {
    arch: "amd64",
    hostname: "ubuntu",
    metadata: { paxl: { status: "installed", version: "0.1.61" } },
    node_id: "node_ubuntu_23ca7f00018f68b",
    online: true,
    os: "linux",
    paxd_version: "0.1.61",
    ...overrides,
  };
}

const agents: Agent[] = [
  {
    agent_id: "agent_claude",
    agent_type: "claude-code",
    name: "reviewer",
    description: "Reviews risky changes",
    node_id: "node_ubuntu_23ca7f00018f68b",
    online: true,
  },
  {
    agent_id: "agent_codex",
    agent_type: "codex",
    node_id: "node_ubuntu_23ca7f00018f68b",
    online: true,
  },
];

function renderCard(
  node: Node,
  { admin = false, list = agents }: { admin?: boolean; list?: Agent[] } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const actions = {
    onAgentSettings: vi.fn(),
    onDeleteAgent: vi.fn(),
    onDeleteDevice: vi.fn(),
    onRename: vi.fn(),
  };
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DeviceCard
          admin={admin}
          agents={list}
          node={node}
          userId="user_1"
          {...actions}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return actions;
}

const openMenu = (name: string) =>
  userEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

it("lists a device with its agents and keeps versions and identifiers out of sight", async () => {
  renderCard(device());

  const card = screen.getByRole("article", { name: "ubuntu" });
  expect(card).toHaveTextContent("Linux · online");
  expect(screen.queryByText("0.1.61")).not.toBeInTheDocument();
  expect(card).not.toHaveTextContent("node_ubuntu");
  expect(screen.queryByRole("link", { name: /ubuntu/ })).toBeNull();

  const rows = screen.getAllByTestId("agent-row");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("reviewer");
  expect(rows[0]).toHaveTextContent("Claude Code · Reviews risky changes");
  expect(rows[0]).toHaveTextContent("Available");
  expect(rows[1]).toHaveTextContent("Codex");
  expect(screen.getByRole("link", { name: "Add agent" })).toHaveAttribute(
    "href",
    "/settings/devices/agents/add?nodeId=node_ubuntu_23ca7f00018f68b",
  );
});

it("tells which agents still need to sign in and links to the sign-in page", async () => {
  renderCard(device());

  const [claude, codex] = screen.getAllByTestId("agent-row");
  expect(await within(claude).findByText("Signed in")).toBeVisible();
  expect(await within(codex).findByText("Sign-in needed")).toBeVisible();
  expect(within(codex).getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/settings/agent-sign-in?node_id=node_ubuntu_23ca7f00018f68b&harness=codex",
  );
});

it("offers people rename, update and delete, and keeps maintenance for administrators", async () => {
  const actions = renderCard(device());
  await openMenu("ubuntu");
  expect(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
  ).toEqual(["Rename…", "Update PAX…", "Delete device…"]);
  await userEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
  expect(actions.onRename).toHaveBeenCalledWith(device());

  cleanup();
  renderCard(device(), { admin: true });
  expect(screen.getAllByText("0.1.61")).toHaveLength(2);
  await openMenu("ubuntu");
  expect(screen.getByRole("menuitem", { name: "Restart paxd…" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Upgrade paxl…" })).toBeVisible();
  expect(
    screen.getByRole("menuitem", { name: "Runtime details" }),
  ).toHaveAttribute("href", "/nodes/node_ubuntu_23ca7f00018f68b");
});

it("keeps an offline device listed, with its last heartbeat age, and pauses what needs the device", async () => {
  vi.useFakeTimers({
    now: Date.parse("2026-10-22T12:00:00Z"),
    toFake: ["Date"],
  });
  const actions = renderCard(
    device({ last_heartbeat: "2026-10-19T12:00:00Z", online: false }),
  );

  expect(screen.getByRole("article", { name: "ubuntu" })).toHaveTextContent(
    "Linux · offline 3d",
  );
  expect(screen.getAllByTestId("agent-row")[0]).toHaveTextContent("Offline");
  expect(screen.getByRole("button", { name: "Add agent" })).toBeDisabled();
  expect(screen.getByText("Available when the device is online")).toBeVisible();
  expect(api.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining("/auth/status"),
    expect.anything(),
  );
  await openMenu("ubuntu");
  expect(
    await screen.findByRole("menuitem", { name: "Update PAX…" }),
  ).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Delete device…" }),
  );
  expect(actions.onDeleteDevice).toHaveBeenCalledOnce();
});

it("flags a paxl that paxd reports as missing to administrators", () => {
  renderCard(device({ metadata: { paxl: { status: "missing" } } }), {
    admin: true,
  });
  expect(screen.getByText("missing")).toBeInTheDocument();
});

it("shows a running command and resumes it from the card", async () => {
  renderCard(device({ latest_daemon_commands: [command({})] }));

  await userEvent.click(
    screen.getByRole("button", { name: "Upgrading paxl → 0.1.62" }),
  );

  expect(
    await screen.findByRole("list", { name: "Progress" }),
  ).toBeInTheDocument();
  expect(api.fetch).toHaveBeenCalledWith(
    "/api/v1/user/user_1/nodes/node_ubuntu_23ca7f00018f68b/daemon/commands/cmd_paxl",
  );
});

it("opens the failed command details from the failure note", async () => {
  renderCard(
    device({
      latest_daemon_commands: [command({ state: "failed", status: "failed" })],
    }),
  );

  await userEvent.click(
    screen.getByRole("button", { name: "paxl upgrade failed" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "permission denied",
  );
});

it("opens an agent's settings, sign-in page and deletion from its menu", async () => {
  const actions = renderCard(device());
  await openMenu("reviewer");
  expect(
    screen.getByRole("menuitem", { name: "Sign-in & usage" }),
  ).toHaveAttribute(
    "href",
    "/settings/agent-sign-in?node_id=node_ubuntu_23ca7f00018f68b&harness=claude-code",
  );
  expect(
    screen.queryByRole("menuitem", { name: "Runtime details" }),
  ).toBeNull();
  await userEvent.click(screen.getByRole("menuitem", { name: "Settings…" }));
  expect(actions.onAgentSettings).toHaveBeenCalledWith(agents[0]);

  await openMenu("reviewer");
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Delete agent…" }),
  );
  expect(actions.onDeleteAgent).toHaveBeenCalledWith(agents[0]);
});

it("restarts an agent through its connection on the device", async () => {
  renderCard(device());
  await openMenu("reviewer");
  await userEvent.click(screen.getByRole("menuitem", { name: "Restart" }));

  await waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      "/api/v1/user/user_1/nodes/node_ubuntu_23ca7f00018f68b/daemon/agent-connections/conn_claude/restart",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("says so when the device no longer has the agent's connection", async () => {
  renderCard(device());
  await openMenu("Codex");
  await userEvent.click(screen.getByRole("menuitem", { name: "Restart" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This agent's connection was not found on the device.",
  );
});

it("given a device card, when switching to Chinese, then localizes status and actions", async () => {
  const actions = renderCard(device({ name: "Build Mac" }));
  act(() => useLocaleStore.setState({ locale: "zh-CN" }));
  expect(screen.getByRole("article", { name: "Build Mac" })).toHaveTextContent(
    "Linux · 在线",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Build Mac 的操作" }),
  );
  expect(screen.getByRole("menuitem", { name: "重命名…" })).toBeVisible();
  await userEvent.click(screen.getByRole("menuitem", { name: "删除设备…" }));
  expect(actions.onDeleteDevice).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Build Mac" }),
  );
});
