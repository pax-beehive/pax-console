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

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/summaries",
  useSearchParams: () => new URLSearchParams(),
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  useConsoleStore.setState({ sidebarCollapsed: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("summary developer navigation", () => {
  it("exposes an active desktop link only in the admin view", () => {
    const view = render(
      <TooltipProvider>
        <Sidebar showAdminFeatures />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Summary developer" }),
    ).toHaveAttribute("aria-current", "page");
    view.rerender(
      <TooltipProvider>
        <Sidebar showAdminFeatures={false} />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("link", { name: "Summary developer" }),
    ).not.toBeInTheDocument();
  });
  it("keeps mobile administration active and links summaries from its shared tabs", () => {
    render(
      <>
        <MobileNav showAdminFeatures />
        <AdminAnalyticsNav />
      </>,
    );
    expect(
      screen.getAllByRole("link", { name: "Customers" })[0],
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Summary developer" }),
    ).toHaveAttribute("href", "/admin/summaries");
    expect(
      screen.getByRole("link", { name: "Summary developer" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
