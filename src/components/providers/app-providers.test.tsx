// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "./app-providers";
import { loadRegionConfig } from "@/features/region/bootstrap";

const route = vi.hoisted(() => ({ pathname: "/overview" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/features/region/bootstrap", () => ({
  loadRegionConfig: vi.fn(),
  bootstrapRegion: vi.fn(),
  measureRegions: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.mocked(loadRegionConfig).mockResolvedValue({ enabled: false });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("public overview and account boundary", () => {
  it("serves readable overview HTML before JavaScript or account requests", () => {
    route.pathname = "/overview";
    expect(
      renderToString(
        <AppProviders>
          <h1>PaxWorkspace</h1>
        </AppProviders>,
      ),
    ).toContain("<h1>PaxWorkspace</h1>");
    render(
      <AppProviders>
        <h1>PaxWorkspace</h1>
      </AppProviders>,
    );
    expect(screen.getByRole("heading").textContent).toBe("PaxWorkspace");
    expect(loadRegionConfig).not.toHaveBeenCalled();
  });

  it.each(["/", "/sessions/example", "/overview/private"])(
    "keeps %s behind the region gate",
    async (pathname) => {
      route.pathname = pathname;
      render(
        <AppProviders>
          <h1>Account content</h1>
        </AppProviders>,
      );
      expect(screen.queryByRole("heading")).toBeNull();
      await screen.findByRole("heading");
      expect(loadRegionConfig).toHaveBeenCalledOnce();
    },
  );

  it("starts the account gate when navigating from the overview to the workbench", async () => {
    route.pathname = "/overview";
    const view = render(
      <AppProviders>
        <h1>Page content</h1>
      </AppProviders>,
    );
    expect(loadRegionConfig).not.toHaveBeenCalled();
    route.pathname = "/";
    view.rerender(
      <AppProviders>
        <h1>Page content</h1>
      </AppProviders>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    await screen.findByRole("heading");
    expect(loadRegionConfig).toHaveBeenCalledOnce();
  });
});
