/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaxdConnectPageClient } from "./paxd-connect-page-client";

const longRegistrationId =
  "nreg_0123456789abcdef0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => ({
  approveNodeRegistration: vi.fn(),
  getNodeRegistration: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("code=U045WB"),
}));

vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { email: string; user_id: string }) => React.ReactNode;
  }) => children({ email: "operator@example.com", user_id: "user_1" }),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    approveNodeRegistration: mocks.approveNodeRegistration,
    getNodeRegistration: mocks.getNodeRegistration,
  };
});

beforeEach(() => {
  mocks.getNodeRegistration.mockReset().mockResolvedValue({
    pair_code: "U045WB",
    registration_id: "nreg_preview",
    status: "pending",
  });
  mocks.approveNodeRegistration.mockReset().mockResolvedValue({
    pair_code: "U045WB",
    registration_id: longRegistrationId,
    status: "approved",
  });
});

afterEach(() => cleanup());

describe("PaxdConnectPageClient approval panel layout", () => {
  it("keeps intrinsic and dynamic content within the approval panel", async () => {
    renderConnectPage();

    const input = screen.getByRole("textbox", { name: "Pair code" });
    const label = input.closest("label");
    const form = input.closest("form");
    const panel = form?.closest("aside");

    expect(panel).toHaveClass("min-w-0", "max-w-full");
    expect(form).toHaveClass("min-w-0");
    expect(label).toHaveClass("min-w-0");
    expect(input).toHaveClass("w-full", "min-w-0", "max-w-full");

    await userEvent.click(screen.getByRole("button", { name: "Connect paxd" }));

    const registration = await screen.findByText(
      `registration: ${longRegistrationId}`,
    );
    expect(registration).toHaveClass("min-w-0", "break-all");
  });
});

function renderConnectPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PaxdConnectPageClient />
    </QueryClientProvider>,
  );
}
