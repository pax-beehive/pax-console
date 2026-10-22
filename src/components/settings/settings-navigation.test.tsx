/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsMobileNav, SettingsSidebar } from "./settings-navigation";
import { settingsSectionForPath } from "./settings-catalog";

const route = vi.hoisted(() => ({ pathname: "/settings", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: route.push }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("settings navigation", () => {
  it("opens a real settings section at the root and keeps nested routes in their category", () => {
    expect(settingsSectionForPath("/settings")?.id).toBe("notifications");
    expect(settingsSectionForPath("/settings/devices/agents/add")?.id).toBe(
      "devices",
    );
    expect(settingsSectionForPath("/nodes/device-one")?.id).toBe("devices");
    expect(settingsSectionForPath("/e2ee/pairing")?.id).toBe("encryption");
    expect(settingsSectionForPath("/settings/advanced/api-keys")?.id).toBe(
      "apiKeys",
    );
    expect(settingsSectionForPath("/sessions/one")).toBeUndefined();
  });

  it("exposes all eight settings with descriptions and one selected section", () => {
    route.pathname = "/settings";
    render(<SettingsSidebar />);
    const navigation = screen.getByRole("navigation", { name: "Settings" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(8);
    expect(
      within(navigation).getByRole("link", { name: /Notifications/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByText("Alerts on this device"),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByText("Security & access"),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByText("Advanced settings"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to workspace/ }),
    ).toHaveAttribute("href", "/");
  });

  it("keeps Devices selected while connecting an agent", () => {
    route.pathname = "/settings/devices/agents/add";
    render(<SettingsSidebar />);
    expect(
      screen.getByRole("link", { name: /Devices & agents/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /Notifications/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("lets mobile users switch directly to a grouped settings section", () => {
    route.pathname = "/settings/notifications";
    render(<SettingsMobileNav />);
    const picker = screen.getByRole("combobox", { name: "Settings section" });
    expect(picker).toHaveValue("/settings/notifications");
    fireEvent.change(picker, {
      target: { value: "/settings/advanced/api-keys" },
    });
    expect(route.push).toHaveBeenCalledWith("/settings/advanced/api-keys");
  });
});
