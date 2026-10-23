// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaxlLoginPageClient } from "./paxl-login-page-client";
import { confirmRegionalLogin } from "@/features/auth/paxl-login";
import { approvePaxlDeviceLogin } from "@/features/api/resources";
import { getRegionalOrigin } from "@/features/region/bootstrap";

const state = vi.hoisted(() => ({ query: "us_code=ABC123&hk_code=DEF456" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({ children }: { children: (user: unknown) => React.ReactNode }) =>
    children({ user_id: "usr_alice", email: "alice@example.com" }),
}));
vi.mock("@/features/auth/paxl-login", async (original) => ({
  ...(await original<object>()),
  confirmRegionalLogin: vi.fn(),
}));
vi.mock("@/features/api/resources", () => ({
  approvePaxlDeviceLogin: vi.fn(),
}));
vi.mock("@/features/region/bootstrap", () => ({ getRegionalOrigin: vi.fn() }));

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PaxlLoginPageClient />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.query = "us_code=ABC123&hk_code=DEF456";
  vi.mocked(getRegionalOrigin).mockReturnValue("https://paxworkspace.net");
  vi.mocked(confirmRegionalLogin).mockResolvedValue({ status: "confirmed" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("Given two regional codes, When approved, Then sends both to the identity router", async () => {
  mount();
  expect(screen.queryByLabelText("Approval code")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText("Approval complete");
  expect(confirmRegionalLogin).toHaveBeenCalledWith({
    codes: { us: "ABC123", hk: "DEF456" },
  });
  expect(approvePaxlDeviceLogin).not.toHaveBeenCalled();
});
it("Given a home-region error, Then preserves the error without calling the legacy endpoint", async () => {
  vi.mocked(confirmRegionalLogin).mockRejectedValue(
    Error("Home region is unavailable"),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText("Home region is unavailable");
  expect(screen.queryByText("Approval complete")).toBeNull();
  expect(approvePaxlDeviceLogin).not.toHaveBeenCalled();
});
it("Given an explicit administrator target, Then displays and preserves Hong Kong", async () => {
  state.query = "code=DEF456&region=hk&admin=1";
  mount();
  expect(
    screen.getByText(/Administrator access is requested for Hong Kong/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText("Approval complete");
  expect(confirmRegionalLogin).toHaveBeenCalledWith({
    code: "DEF456",
    target_region: "hk",
    admin: true,
  });
});
it("Given regional parameters on a legacy Console, Then fails without approving", async () => {
  vi.mocked(getRegionalOrigin).mockReturnValue(undefined);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText(/Regional login is unavailable/);
  expect(confirmRegionalLogin).not.toHaveBeenCalled();
  expect(approvePaxlDeviceLogin).not.toHaveBeenCalled();
});
it("Given duplicate target parameters, Then rejects the link before approval", () => {
  state.query = "code=ABC123&code=DEF456";
  mount();
  expect(screen.getByRole("alert").textContent).toContain("ambiguous");
  expect(screen.queryByRole("button")).toBeNull();
});
