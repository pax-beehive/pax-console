/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConsoleStore } from "@/stores/console-store";
import { SettingsSidebar } from "./settings-navigation";
import { settingsSectionForPath } from "./settings-catalog";

const state = vi.hoisted(() => ({
  pathname: "/settings",
  role: "user",
  grants: [] as { approval_id: string; grant_revoked_at?: string }[],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => ({
    data: { user_id: "settings-user", role: state.role },
  }),
}));
vi.mock("@/features/api/resources", () => ({
  useApprovalGrants: () => ({ data: { grants: state.grants } }),
}));

afterEach(() => {
  cleanup();
  state.pathname = "/settings";
  state.role = "user";
  state.grants = [];
  useConsoleStore.setState({ previewAsUser: false });
});

const navigation = () => screen.getByRole("navigation", { name: "Settings" });

describe("settings navigation", () => {
  it("keeps nested and legacy routes in their entry and gives the overview none", () => {
    expect(settingsSectionForPath("/settings")).toBeUndefined();
    expect(settingsSectionForPath("/settings/advanced")).toBeUndefined();
    expect(settingsSectionForPath("/settings/devices/agents/add")?.id).toBe(
      "devices",
    );
    expect(settingsSectionForPath("/nodes/device-one")?.id).toBe("devices");
    expect(settingsSectionForPath("/e2ee/pairing")?.id).toBe("encryption");
    expect(settingsSectionForPath("/settings/security")?.id).toBe(
      "permissions",
    );
    expect(settingsSectionForPath("/settings/advanced/api-keys")?.id).toBe(
      "apiKeys",
    );
    expect(settingsSectionForPath("/settings/language")?.id).toBe("language");
    expect(settingsSectionForPath("/sessions/one")).toBeUndefined();
  });

  it("shows a signed-in user one directory without administrator or permission entries", () => {
    render(<SettingsSidebar />);
    expect(
      within(navigation())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/settings",
      "/settings/devices",
      "/settings/agent-sign-in",
      "/settings/projects",
      "/settings/secretary",
      "/settings/advanced/encryption",
      "/settings/language",
      "/settings/notifications",
      "/settings/voice",
      "/settings/advanced/api-keys",
      "/settings/advanced/node-registration",
    ]);
    expect(
      within(navigation()).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation()).getByText("Privacy & security"),
    ).toBeInTheDocument();
    expect(
      within(navigation()).getByText("Language and account region"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
      "href",
      "mailto:kevingeng@paxtech.net",
    );
    expect(
      screen.getByRole("link", { name: /Back to workspace/ }),
    ).toHaveAttribute("href", "/");
  });

  it("lists Allowed actions only while the account has a standing permission", () => {
    state.grants = [{ approval_id: "revoked", grant_revoked_at: "2026-11-01" }];
    const { rerender } = render(<SettingsSidebar />);
    expect(
      screen.queryByRole("link", { name: /Allowed actions/ }),
    ).not.toBeInTheDocument();

    state.grants = [...state.grants, { approval_id: "standing" }];
    rerender(<SettingsSidebar />);
    expect(
      screen.getByRole("link", { name: /Allowed actions/ }),
    ).toHaveAttribute("href", "/settings/advanced/permissions");
  });

  it("shows Service status to administrators and hides it while they preview as a user", () => {
    state.role = "admin";
    const { rerender } = render(<SettingsSidebar />);
    expect(within(navigation()).getByText("Administrator")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Service status/ }),
    ).toHaveAttribute("href", "/settings/service-status");

    useConsoleStore.setState({ previewAsUser: true });
    rerender(<SettingsSidebar />);
    expect(
      screen.queryByRole("link", { name: /Service status/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps My devices selected while connecting an agent", () => {
    state.pathname = "/settings/devices/agents/add";
    render(<SettingsSidebar />);
    expect(screen.getByRole("link", { name: /My devices/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("selects the agent sign-in recovery destination", () => {
    state.pathname = "/settings/agent-sign-in";
    render(<SettingsSidebar />);
    expect(
      screen.getByRole("link", { name: /Agent sign-in & usage/ }),
    ).toHaveAttribute("aria-current", "page");
  });
});
