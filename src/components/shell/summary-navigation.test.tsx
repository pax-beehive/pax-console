/* @vitest-environment jsdom */

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";
import { AdminAnalyticsNav } from "@/components/analytics/admin-analytics-nav";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

const state = vi.hoisted(() => ({
  pathname: "/admin/summaries",
  role: "admin",
}));
vi.mock("@/features/flags", () => ({
  useFeature: () => true,
  useFeatures: () => ({ ready: true, enabled: () => true }),
}));
vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => ({ data: { user_id: "nav-user", role: state.role } }),
}));
vi.mock("@/features/api/resources", () => ({
  useApprovalGrants: () => ({ data: { grants: [] } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
beforeEach(() => {
  state.pathname = "/admin/summaries";
  state.role = "admin";
  vi.stubGlobal("React", React);
  useConsoleStore.setState({ sidebarCollapsed: false, previewAsUser: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const desktop = () =>
  render(
    <TooltipProvider>
      <Sidebar />
    </TooltipProvider>,
  );

describe("administrator page navigation", () => {
  it("lists administrator pages in the settings sidebar and selects the open one", () => {
    desktop();
    expect(
      screen.getByRole("navigation", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Summary developer/ }),
    ).toHaveAttribute("aria-current", "page");
    for (const [name, href] of [
      [/Runtime configuration/, "/admin/config"],
      [/Customers/, "/admin/customers"],
      [/Push subscriptions/, "/admin/notifications"],
      [/Service status/, "/settings/service-status"],
    ] as const)
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("hides them from everyone else, and from an administrator previewing as a user", () => {
    state.role = "user";
    const view = desktop();
    expect(
      screen.queryByRole("link", { name: /Summary developer/ }),
    ).not.toBeInTheDocument();

    state.role = "admin";
    useConsoleStore.setState({ previewAsUser: true });
    view.rerender(
      <TooltipProvider>
        <Sidebar />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("link", { name: /Customers/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps Settings active on mobile and links summaries from the shared tabs", () => {
    render(
      <>
        <MobileNav />
        <AdminAnalyticsNav />
      </>,
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Summary developer" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("selects Runtime configuration on its page", () => {
    state.pathname = "/admin/config";
    desktop();
    expect(
      screen.getByRole("link", { name: /Runtime configuration/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /Summary developer/ }),
    ).not.toHaveAttribute("aria-current");
  });
});
