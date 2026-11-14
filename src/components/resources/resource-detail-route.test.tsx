/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConsoleStore } from "@/stores/console-store";
import { ResourceDetailRoute } from "./resource-detail-route";

const state = vi.hoisted(() => ({ role: "user", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { user_id: string; role: string }) => ReactNode;
  }) => children({ user_id: "detail-user", role: state.role }),
}));
vi.mock("./resource-detail-page-client", () => ({
  NodeDetailPageClient: () => <h1>Device runtime details</h1>,
  AgentDetailPageClient: () => <h1>Agent runtime details</h1>,
}));

afterEach(() => {
  cleanup();
  state.role = "user";
  useConsoleStore.setState({ previewAsUser: false });
  vi.clearAllMocks();
});

describe("runtime detail routes", () => {
  it("sends people who are not administrators back to My devices", async () => {
    render(<ResourceDetailRoute kind="node" nodeId="node-one" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith("/settings/devices"),
    );
  });

  it("opens device and agent details for administrators", () => {
    state.role = "admin";
    const { rerender } = render(
      <ResourceDetailRoute kind="node" nodeId="node-one" />,
    );
    expect(
      screen.getByRole("heading", { name: "Device runtime details" }),
    ).toBeVisible();
    rerender(<ResourceDetailRoute agentId="agent-one" kind="agent" />);
    expect(
      screen.getByRole("heading", { name: "Agent runtime details" }),
    ).toBeVisible();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("closes them while an administrator previews as a user", async () => {
    state.role = "admin";
    useConsoleStore.setState({ previewAsUser: true });
    render(<ResourceDetailRoute agentId="agent-one" kind="agent" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith("/settings/devices"),
    );
  });
});
