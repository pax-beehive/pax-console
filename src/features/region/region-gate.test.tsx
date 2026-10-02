// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegionGate } from "./region-gate";
import { bootstrapRegion, loadRegionConfig, measureRegions } from "./bootstrap";
vi.mock("./bootstrap", () => ({
  bootstrapRegion: vi.fn(),
  loadRegionConfig: vi.fn(),
  measureRegions: vi.fn(),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    variant,
    ...props
  }: React.ComponentProps<"button"> & {
    asChild?: boolean;
    variant?: string;
  }) => {
    void variant;
    return asChild ? children : <button {...props}>{children}</button>;
  },
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RegionGate>
        <div>Account content</div>
      </RegionGate>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(loadRegionConfig).mockResolvedValue({
    enabled: true,
    origin: window.location.origin,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("restores existing accounts before mounting any account requests", async () => {
  vi.mocked(bootstrapRegion).mockResolvedValue({
    status: "ready",
    user_id: "usr_old",
    region: "us",
  });
  mount();
  expect(screen.queryByText("Account content")).toBeNull();
  await screen.findByText("Account content");
  expect(measureRegions).not.toHaveBeenCalled();
});
it("offers the available recommendation, then opens only the committed assignment", async () => {
  vi.mocked(bootstrapRegion)
    .mockResolvedValueOnce({
      status: "selection_required",
      regions: ["us", "hk"],
    })
    .mockResolvedValueOnce({
      status: "ready",
      user_id: "usr_new",
      region: "hk",
    });
  vi.mocked(measureRegions).mockResolvedValue({
    us: null,
    hk: 90,
    recommended: "hk",
  });
  mount();
  const hk = await screen.findByRole("button", {
    name: "Hong Kong · Recommended",
  });
  expect(
    (screen.getByRole("button", { name: "United States" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(hk);
  await screen.findByText("Account content");
  expect(bootstrapRegion).toHaveBeenLastCalledWith("hk");
});
it("keeps failures visible and retries the authoritative bootstrap", async () => {
  vi.mocked(bootstrapRegion)
    .mockRejectedValueOnce(Error("Region unavailable"))
    .mockResolvedValueOnce({
      status: "ready",
      user_id: "usr_old",
      region: "hk",
    });
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("Account content")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Account content");
});
it("retains legacy mode when explicitly disabled and blocks invalid configuration", async () => {
  vi.mocked(loadRegionConfig).mockResolvedValue({ enabled: false });
  mount();
  await screen.findByText("Account content");
  expect(bootstrapRegion).not.toHaveBeenCalled();
  cleanup();
  vi.mocked(loadRegionConfig).mockRejectedValue(Error("Config unavailable"));
  mount();
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Config unavailable",
    ),
  );
  expect(screen.queryByText("Account content")).toBeNull();
});
