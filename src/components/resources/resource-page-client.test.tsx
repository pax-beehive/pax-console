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
import { ResourcePageClient } from "./resource-page-client";

const state = vi.hoisted(() => ({
  admin: false,
  agents: [] as Record<string, unknown>[],
  deleteApiKey: vi.fn(async () => ({})),
  revokeApprovalGrant: vi.fn(async () => ({})),
}));
vi.mock("@/features/api/resources", async (original) => ({
  ...(await original<typeof import("@/features/api/resources")>()),
  deleteApiKey: state.deleteApiKey,
  revokeApprovalGrant: state.revokeApprovalGrant,
  useAgents: () => ({ data: { agents: state.agents }, isLoading: false }),
  useApiKeys: () => ({
    data: {
      api_keys: [
        { key_id: "key_ci", name: "CI key" },
        { key_id: "key_cli", name: "Laptop CLI" },
      ],
    },
    isLoading: false,
  }),
  useApprovalGrants: () => ({
    data: { grants: [{ approval_id: "grant_tests", title: "Run tests" }] },
    isLoading: false,
  }),
  useApprovals: () => ({ data: { approvals: [] }, isLoading: false }),
  useHealth: () => ({ data: undefined, isLoading: false }),
  useNodes: () => ({ data: { nodes: [] }, isLoading: false }),
}));
vi.mock("@/features/auth/use-admin-view", () => ({
  useAdminView: () => state.admin,
}));
vi.mock("@/features/e2ee/root-key-store", () => ({
  deleteRootKey: vi.fn(),
  loadRootKey: async () => null,
  saveRootKey: vi.fn(),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/advanced",
}));

function open(kind: "api-keys" | "grants" | "encryption") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ResourcePageClient
          kind={kind}
          user={{ user_id: "user_1", role: "user" }}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  state.admin = false;
  state.agents = [];
  vi.clearAllMocks();
});

describe("settings resource pages", () => {
  it("asks before revoking an API key and names the key", async () => {
    const user = open("api-keys");
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[1]);

    expect(state.deleteApiKey).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Revoke this API key?" });
    expect(dialog).toHaveTextContent(
      "Scripts and applications that use Laptop CLI will stop working. A revoked key cannot be restored.",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.deleteApiKey).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Revoke" })[1]);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Revoke",
      }),
    );
    await waitFor(() =>
      expect(state.deleteApiKey).toHaveBeenCalledWith("user_1", "key_cli"),
    );
  });

  it("asks before revoking a standing permission", async () => {
    const user = open("grants");
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(state.revokeApprovalGrant).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Revoke this permission?" }),
    ).toHaveTextContent(
      "Run tests will no longer be allowed automatically. The agent has to ask again before doing it.",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Revoke",
      }),
    );
    await waitFor(() =>
      expect(state.revokeApprovalGrant).toHaveBeenCalledWith(
        "user_1",
        "grant_tests",
      ),
    );
  });

  it("keeps the manual root-key tool for administrators", () => {
    state.agents = [{ agent_id: "agent_one", name: "reviewer" }];
    open("encryption");
    expect(
      screen.getByRole("link", { name: "Pair this device" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Advanced: manually manage root key"),
    ).not.toBeInTheDocument();

    cleanup();
    state.admin = true;
    open("encryption");
    expect(
      screen.getByText("Advanced: manually manage root key"),
    ).toBeVisible();
  });

  it("points an account without agents at adding one", () => {
    open("encryption");
    expect(screen.getByText("Encrypted chats need an agent.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add agent" })).toHaveAttribute(
      "href",
      "/settings/devices/agents/add",
    );
  });
});
