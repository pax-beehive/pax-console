/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";
import { Topbar } from "./topbar";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

const flags = vi.hoisted(() => ({ collaboration: false }));
vi.mock("@/features/flags", () => ({
  useFeature: () => flags.collaboration,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  flags.collaboration = false;
  useConsoleStore.setState({ sidebarCollapsed: false, previewAsUser: false });
});

describe("Search navigation", () => {
  it("provides a working GET search form for a regular signed-in user", () => {
    render(
      <TooltipProvider>
        <Topbar
          user={{ user_id: "owner", email: "owner@example.test", role: "user" }}
        />
      </TooltipProvider>,
    );
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    const input = within(form).getByRole("searchbox", { name: "Quick search" });
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveAttribute("maxlength", "256");
    expect(input).toBeRequired();
  });

  it("keeps desktop search available when admin features are hidden", () => {
    useConsoleStore.setState({ sidebarCollapsed: false, previewAsUser: true });
    render(
      <TooltipProvider>
        <Sidebar showAdminFeatures={false} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute(
      "href",
      "/search",
    );
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("link", { name: "Collaboration" }),
    ).not.toBeInTheDocument();
  });

  it("exposes active search navigation on mobile for regular users", () => {
    render(<MobileNav showAdminFeatures={false} />);
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass(
      "grid-cols-3",
    );
    expect(
      screen.queryByRole("link", { name: "Collaboration" }),
    ).not.toBeInTheDocument();
  });

  it("preserves customer and collaboration navigation in the admin mobile layout", () => {
    flags.collaboration = true;
    render(<MobileNav showAdminFeatures />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass(
      "grid-cols-5",
    );
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/admin/customers",
    );
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
  });

  it("opens desktop Collaboration to a granted ordinary user while keeping administrator tools hidden", () => {
    flags.collaboration = true;
    render(
      <TooltipProvider>
        <Sidebar showAdminFeatures={false} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("link", { name: "Collaboration" })).toHaveAttribute(
      "href",
      "/collaboration/teams",
    );
    expect(
      screen.queryByRole("link", { name: "Customers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Runtime configuration" }),
    ).not.toBeInTheDocument();
  });

  it("uses four mobile columns for a granted ordinary user without exposing administrator tools", () => {
    flags.collaboration = true;
    render(<MobileNav showAdminFeatures={false} />);
    expect(
      screen.getByRole("link", { name: "Collaboration" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Customers" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass(
      "grid-cols-4",
    );
  });

  it("hides a disabled product feature even for administrators and preserves administrator links", () => {
    render(
      <TooltipProvider>
        <Sidebar showAdminFeatures />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("link", { name: "Collaboration" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Runtime configuration" }),
    ).toHaveAttribute("href", "/admin/config");
  });
});
