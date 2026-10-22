/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./settings-page-client";

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
vi.mock("./notification-settings", () => ({
  NotificationSettings: () => <h1>Notification controls</h1>,
}));
vi.mock("@/components/resources/resource-page-client", () => ({
  ResourcePageClient: ({ kind }: { kind: string }) => <h1>{kind}</h1>,
}));
vi.mock("@/features/api/resources", () => ({
  useNodes: () => ({ data: { nodes: [] } }),
  useAgents: () => ({ data: { agents: [] } }),
  useHealth: () => ({ data: { status: "ok" } }),
}));

let desktop = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  desktop = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return desktop;
    },
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
});
afterEach(() => {
  cleanup();
  listeners.clear();
  vi.unstubAllGlobals();
});

describe("settings landing pages", () => {
  it("keeps the original mobile directory without mounting notification controls", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveAttribute(
      "href",
      "/settings/notifications",
    );
    expect(screen.getByRole("link", { name: /Devices/ })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
    expect(
      screen.getByRole("link", { name: /Advanced settings/ }),
    ).toHaveAttribute("href", "/settings/advanced");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Notification controls")).not.toBeInTheDocument();
  });

  it("keeps the advanced directory and its Settings back link on mobile", () => {
    render(<SettingsPage advanced />);
    expect(
      screen.getByRole("heading", { name: "Advanced settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Allowed actions/ }),
    ).toHaveAttribute("href", "/settings/advanced/permissions");
    expect(screen.getByRole("link", { name: /API keys/ })).toHaveAttribute(
      "href",
      "/settings/advanced/api-keys",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("opens notification content directly on desktop", () => {
    desktop = true;
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Notification controls" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Advanced settings/ }),
    ).not.toBeInTheDocument();
  });

  it("opens allowed actions directly for the desktop Advanced entry", () => {
    desktop = true;
    render(<SettingsPage advanced />);
    expect(screen.getByRole("heading", { name: "grants" })).toBeInTheDocument();
  });

  it("returns to the mobile directory when the viewport becomes narrow", () => {
    desktop = true;
    render(<SettingsPage />);
    act(() => {
      desktop = false;
      listeners.forEach((listener) => listener());
    });
    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Notification controls")).not.toBeInTheDocument();
  });
});
