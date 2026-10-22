/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DaemonCommandRecord, Node } from "@/features/api/types";
import { NodeListRow } from "./node-list-row";

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
    return { platform: "linux/amd64", version: "0.1.62" };
  });
});

afterEach(() => {
  cleanup();
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

function renderRow(node: Node, onDelete = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NodeListRow
          deleting={false}
          node={node}
          onDelete={onDelete}
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onDelete;
}

it("shows presence, platform and both versions without inline buttons", () => {
  renderRow(device());

  expect(screen.getByRole("link", { name: /ubuntu/ })).toHaveAttribute(
    "href",
    "/nodes/node_ubuntu_23ca7f00018f68b",
  );
  expect(screen.getByText("online")).toBeInTheDocument();
  expect(screen.getByText(/linux\/amd64/)).toBeInTheDocument();
  expect(screen.getAllByText("0.1.61")).toHaveLength(2);
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("labels offline devices with their last heartbeat age and disables maintenance", async () => {
  vi.useFakeTimers({
    now: Date.parse("2026-10-22T12:00:00Z"),
    toFake: ["Date"],
  });
  renderRow(device({ last_heartbeat: "2026-10-19T12:00:00Z", online: false }));

  expect(screen.getByText("offline")).toBeInTheDocument();
  expect(screen.getByText(/offline 3d/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for ubuntu" }),
  );
  for (const name of ["Upgrade paxd…", "Restart paxd…", "Upgrade paxl…"]) {
    expect(await screen.findByRole("menuitem", { name })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
  expect(
    screen.getByRole("menuitem", { name: "Delete device…" }),
  ).not.toHaveAttribute("aria-disabled");
});

it("flags a paxl that paxd reports as missing", () => {
  renderRow(device({ metadata: { paxl: { status: "missing" } } }));
  expect(screen.getByText("missing")).toBeInTheDocument();
});

it("shows a running command and resumes it from the row", async () => {
  renderRow(device({ latest_daemon_commands: [command({})] }));

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
  renderRow(
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

it("deletes through the menu", async () => {
  const node = device();
  const onDelete = renderRow(node);

  await userEvent.click(
    screen.getByRole("button", { name: "Actions for ubuntu" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete device…" }),
  );

  expect(onDelete).toHaveBeenCalledWith(node);
});
