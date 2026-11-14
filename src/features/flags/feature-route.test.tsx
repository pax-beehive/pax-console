/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureRoute } from "./feature-route";

const fixtures = vi.hoisted(() => ({
  ready: false,
  enabled: false,
  pathname: "/collaboration/teams",
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fixtures.pathname,
  useRouter: () => ({ replace: fixtures.replace }),
}));
vi.mock("./use-feature", () => ({
  useFeatures: () => ({
    ready: fixtures.ready,
    enabled: () => fixtures.enabled,
  }),
}));
afterEach(() => {
  cleanup();
  fixtures.ready = false;
  fixtures.enabled = false;
  fixtures.pathname = "/collaboration/teams";
  fixtures.replace.mockReset();
});

describe("Given a feature route", () => {
  it("hides content while loading without prematurely redirecting", () => {
    render(
      <FeatureRoute feature="collaboration">
        <div>Feature content</div>
      </FeatureRoute>,
    );
    expect(screen.queryByText("Feature content")).not.toBeInTheDocument();
    expect(fixtures.replace).not.toHaveBeenCalled();
  });

  it("renders content only when the resolved feature is enabled", () => {
    fixtures.ready = true;
    fixtures.enabled = true;
    render(
      <FeatureRoute feature="collaboration">
        <div>Feature content</div>
      </FeatureRoute>,
    );
    expect(screen.getByText("Feature content")).toBeInTheDocument();
    expect(fixtures.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["/collaboration/teams", "/"],
    ["/settings/secretary", "/settings"],
  ])("redirects disabled content from %s to %s", (pathname, destination) => {
    fixtures.ready = true;
    fixtures.pathname = pathname;
    render(
      <FeatureRoute feature="collaboration">
        <div>Feature content</div>
      </FeatureRoute>,
    );
    expect(screen.queryByText("Feature content")).not.toBeInTheDocument();
    expect(fixtures.replace).toHaveBeenCalledWith(destination);
  });

  it("lets a caller explicitly choose one of the two safe destinations", () => {
    fixtures.ready = true;
    render(
      <FeatureRoute feature="secretary" fallbackHref="/settings">
        <div>Feature content</div>
      </FeatureRoute>,
    );
    expect(fixtures.replace).toHaveBeenCalledWith("/settings");
  });
});
