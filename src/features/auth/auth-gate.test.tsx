/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/features/api/client";
import { ApiError, AuthError } from "@/features/api/errors";
import { AuthGate } from "./auth-gate";

vi.mock("@/features/api/client", async (load) => ({
  ...(await load<typeof import("@/features/api/client")>()),
  apiFetch: vi.fn(),
}));
vi.mock("./sign-in-redirect", () => ({
  SignInRedirect: () => <div>Redirecting to sign in</div>,
}));

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AuthGate>{(user) => <div>Workspace for {user.user_id}</div>}</AuthGate>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.resetAllMocks();
});

describe("account access failures", () => {
  it("waits for the account request before showing account content", () => {
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(() => {}));
    mount();
    expect(screen.getByText("Checking PAX access...")).toBeInTheDocument();
    expect(screen.queryByText(/Workspace for/)).not.toBeInTheDocument();
  });

  it.each([
    ["HTTP 500", new ApiError("Internal service error", 500, null)],
    ["HTTP 503", new ApiError("Region temporarily unavailable", 503, null)],
    ["timeout", new DOMException("Request timed out", "TimeoutError")],
    ["network failure", new TypeError("Failed to fetch")],
  ])(
    "offers retry for %s without asking the user to sign in",
    async (_name, error) => {
      vi.mocked(apiFetch).mockRejectedValueOnce(error);
      mount();
      expect(
        await screen.findByRole("heading", {
          name: "Unable to load your account.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(error.message);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /sign in/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Redirecting to sign in"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Workspace for/)).not.toBeInTheDocument();
    },
  );

  it("retries the current-user request and restores the workspace", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiError("Unavailable", 503, null))
      .mockResolvedValueOnce({ user: { user_id: "usr_test" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Workspace for usr_test"),
    ).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/user/self/me");
  });

  it("continues to redirect confirmed authentication failures", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new AuthError());
    mount();
    expect(
      await screen.findByText("Redirecting to sign in"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Workspace for/)).not.toBeInTheDocument();
  });

  it("hides a cached profile when authentication fails on refetch", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ user: { user_id: "usr_test" } })
      .mockRejectedValueOnce(new AuthError());
    const client = mount();
    expect(
      await screen.findByText("Workspace for usr_test"),
    ).toBeInTheDocument();
    await act(() => client.invalidateQueries({ queryKey: ["me"] }));
    expect(
      await screen.findByText("Redirecting to sign in"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Workspace for usr_test"),
    ).not.toBeInTheDocument();
  });

  it("keeps an empty profile unavailable without calling it expired sign-in", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ user: null });
    mount();
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No user profile returned",
    );
    expect(
      screen.queryByText("Redirecting to sign in"),
    ).not.toBeInTheDocument();
  });
});
