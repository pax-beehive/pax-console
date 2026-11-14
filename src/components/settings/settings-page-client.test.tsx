/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./settings-page-client";

const everyFeature = ["secretary", "notifications", "voice_input"];
const state = vi.hoisted(() => ({
  role: "user",
  region: undefined as string | undefined,
  nodes: [] as { node_id: string; kind?: string; online?: boolean }[],
  grants: [] as { approval_id: string }[],
  features: ["secretary", "notifications", "voice_input"],
  agents: [] as { agent_id: string; agent_type: string; node_id: string }[],
  signedOut: [] as string[],
}));
vi.mock("@/features/flags", () => ({
  useFeatures: () => ({
    ready: true,
    enabled: (feature: string) => state.features.includes(feature),
  }),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { user_id: string }) => ReactNode;
  }) => children({ user_id: "settings-user" }),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => ({
    data: { user_id: "settings-user", role: state.role },
  }),
}));
vi.mock("@/features/api/resources", () => ({
  useNodes: () => ({ data: { nodes: state.nodes } }),
  useAgents: () => ({ data: { agents: state.agents } }),
  getNodeHarnessAuth: async (
    _userId: string,
    nodeId: string,
    agentType: string,
  ) => ({
    harness_auth: {
      state: "idle",
      logged_in: !state.signedOut.includes(`${nodeId}/${agentType}`),
    },
  }),
  useApprovalGrants: () => ({ data: { grants: state.grants } }),
}));
vi.mock("@/features/region/account-region", () => ({
  accountRegionName: () => state.region,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
}));

afterEach(() => {
  cleanup();
  state.role = "user";
  state.region = undefined;
  state.nodes = [];
  state.grants = [];
  state.features = everyFeature;
  state.agents = [];
  state.signedOut = [];
});

describe("settings landing pages", () => {
  it("opens an overview of the same directory on every screen size", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Devices & agents", "Work", "Privacy & security", "General"]);
    expect(screen.getByRole("link", { name: /My devices/ })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveAttribute(
      "href",
      "/settings/notifications",
    );
    expect(
      screen.getByRole("link", { name: /Advanced settings/ }),
    ).toHaveAttribute("href", "/settings/advanced");
    expect(screen.getByRole("link", { name: /Contact us/ })).toHaveAttribute(
      "href",
      "mailto:kevingeng@paxtech.net",
    );
    expect(
      screen.queryByRole("link", { name: /Service status/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Allowed actions/ }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .filter((href) => href?.startsWith("/settings/advanced/")),
    ).toEqual(["/settings/advanced/encryption"]);
  });

  it("summarizes connected devices and the language beside their entries", () => {
    state.region = "Hong Kong";
    state.nodes = [
      { node_id: "laptop", online: true },
      { node_id: "server", online: false },
      { node_id: "cli-login", kind: "paxl", online: true },
    ];
    render(<SettingsPage />);
    expect(screen.getByRole("link", { name: /My devices/ })).toHaveTextContent(
      "1 online",
    );
    expect(
      screen.getByRole("link", { name: /Language & region/ }),
    ).toHaveTextContent("English · Hong Kong");
  });

  it("leaves features that are not enabled for the account out of the overview", () => {
    state.features = [];
    render(<SettingsPage />);
    for (const name of [/Secretary/, /Notifications/, /Voice input/])
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Projects/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Language & region/ }),
    ).toBeInTheDocument();
  });

  it("calls out the agent that has to sign in again, asking only online devices", async () => {
    state.nodes = [
      { node_id: "laptop", online: true },
      { node_id: "server", online: false },
    ];
    state.agents = [
      { agent_id: "a1", agent_type: "claude-code", node_id: "laptop" },
      { agent_id: "a2", agent_type: "codex", node_id: "laptop" },
      { agent_id: "a3", agent_type: "codex", node_id: "server" },
    ];
    state.signedOut = ["laptop/codex", "server/codex"];
    render(<SettingsPage />);
    const entry = screen.getByRole("link", { name: /Agent sign-in & usage/ });
    await waitFor(() => expect(entry).toHaveTextContent("Codex needs sign-in"));
  });

  it("counts the agents when more than one kind has to sign in", async () => {
    state.nodes = [{ node_id: "laptop", online: true }];
    state.agents = [
      { agent_id: "a1", agent_type: "claude-code", node_id: "laptop" },
      { agent_id: "a2", agent_type: "codex", node_id: "laptop" },
    ];
    state.signedOut = ["laptop/codex", "laptop/claude-code"];
    render(<SettingsPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Agent sign-in & usage/ }),
      ).toHaveTextContent("2 agents need sign-in"),
    );
  });

  it("adds the entries reserved for administrators and for standing permissions", () => {
    state.role = "admin";
    state.grants = [{ approval_id: "standing" }];
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Administrator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Service status/ }),
    ).toHaveAttribute("href", "/settings/service-status");
    expect(
      screen.getByRole("link", { name: /Allowed actions/ }),
    ).toHaveAttribute("href", "/settings/advanced/permissions");
  });

  it("lists only developer tools in the advanced directory, with a way back", () => {
    render(<SettingsPage advanced />);
    expect(
      screen.getByRole("heading", { name: "Advanced settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /API keys/ })).toHaveAttribute(
      "href",
      "/settings/advanced/api-keys",
    );
    expect(
      screen.getByRole("link", { name: /Manual device registration/ }),
    ).toHaveAttribute("href", "/settings/advanced/node-registration");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(
      screen.queryByRole("link", { name: /Encrypted chats/ }),
    ).not.toBeInTheDocument();
  });
});
