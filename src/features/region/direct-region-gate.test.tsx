// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectRegionGate } from "./direct-region-gate";
import { bootstrapRegion, navigateToRegion, measureRegions } from "./bootstrap";
vi.mock("./bootstrap", () => ({
  bootstrapRegion: vi.fn(),
  navigateToRegion: vi.fn(),
  measureRegions: vi.fn(),
}));
vi.mock("@/features/auth/sign-in", () => ({
  clearSignInAttempt: vi.fn(),
  startSignIn: vi.fn(),
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DirectRegionGate>
        <div>Account content</div>
      </DirectRegionGate>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("opens the existing local account without probes or periodic bootstrap", async () => {
  vi.mocked(bootstrapRegion).mockResolvedValue({
    status: "ready",
    region: "hk",
    user_id: "usr_old",
    origin: window.location.origin,
  });
  mount();
  await screen.findByText("Account content");
  fireEvent.focus(window);
  expect(bootstrapRegion).toHaveBeenCalledTimes(1);
  expect(measureRegions).not.toHaveBeenCalled();
});
it("moves to the configured home region before mounting account requests", async () => {
  vi.mocked(bootstrapRegion).mockResolvedValue({
    status: "ready",
    region: "us",
    user_id: "usr_old",
    origin: "https://us.example",
  });
  mount();
  await screen.findByText("Opening your account region...");
  await vi.waitFor(() =>
    expect(navigateToRegion).toHaveBeenCalledWith("https://us.example"),
  );
  expect(screen.queryByText("Account content")).toBeNull();
});
it("asks new accounts once and persists only the confirmed choice", async () => {
  vi.mocked(bootstrapRegion)
    .mockResolvedValueOnce({
      status: "selection_required",
      regions: ["us", "hk"],
    })
    .mockResolvedValueOnce({
      status: "ready",
      region: "hk",
      user_id: "usr_new",
      origin: window.location.origin,
    });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Hong Kong" }));
  await screen.findByText("Account content");
  expect(bootstrapRegion).toHaveBeenLastCalledWith("hk");
  expect(measureRegions).not.toHaveBeenCalled();
});
it("retries an outage without choosing or falling back to another region", async () => {
  vi.mocked(bootstrapRegion)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce({
      status: "ready",
      region: "hk",
      user_id: "usr_old",
      origin: window.location.origin,
    });
  mount();
  await screen.findByRole("alert");
  expect(navigateToRegion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Account content");
});
