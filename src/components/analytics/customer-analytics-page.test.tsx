// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CustomerAnalyticsAccess,
  CustomerAnalyticsDashboard,
} from "./customer-analytics-page";
import { useCustomerAnalytics } from "@/features/analytics/use-customer-analytics";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { AuthError } from "@/features/api/errors";
vi.mock("@/features/analytics/use-customer-analytics", () => ({
  useCustomerAnalytics: vi.fn(),
  CustomerVisitTracker: () => null,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
const row = {
  user_id: "u1",
  email: "one@example.invalid",
  is_admin: false,
  created_at: "2026-10-01T00:00:00Z",
  first_visit_at: null,
  last_visit_at: null,
  devices: 0,
  agents: 0,
  first_bound_at: null,
  user_messages: 0,
  first_message_at: null,
  last_message_at: null,
  encrypted_records: 0,
  sessions: 0,
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  useConsoleStore.setState({ previewAsUser: false });
  vi.mocked(useCustomerAnalytics).mockReturnValue({
    data: {
      regions: [
        {
          region: "us",
          available: true,
          updated_at: "2026-10-09T00:00:00Z",
          users: [
            row,
            {
              ...row,
              user_id: "admin",
              email: "admin@example.invalid",
              is_admin: true,
              agents: 2,
              user_messages: 4,
            },
          ],
        },
      ],
    },
    focused: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useCustomerAnalytics>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("hides earlier customer data after access is denied", () => {
  const previous = useCustomerAnalytics("admin");
  vi.mocked(useCustomerAnalytics).mockReturnValue({
    ...previous,
    isError: true,
    error: new AuthError(),
  } as ReturnType<typeof useCustomerAnalytics>);
  render(<CustomerAnalyticsDashboard userId="admin" />);
  expect(screen.queryByText("one@example.invalid")).toBeNull();
  expect(screen.getByText("Paused · access denied")).toBeTruthy();
});
it("filters cached data locally and opens truthful customer details", () => {
  render(<CustomerAnalyticsDashboard userId="admin" />);
  expect(screen.queryByText("admin@example.invalid")).toBeNull();
  expect(screen.getByText("Paused · not focused")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Audience"), {
    target: { value: "all" },
  });
  expect(screen.getByText("admin@example.invalid")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Stage"), {
    target: { value: "sent" },
  });
  expect(screen.queryByText("one@example.invalid")).toBeNull();
  fireEvent.click(screen.getByText("admin@example.invalid"));
  expect(screen.getByRole("region", { name: "Customer details" })).toBeTruthy();
  expect(screen.getByText("First confirmed send")).toBeTruthy();
});
it.each([false, true])(
  "does not mount analytics for a non-admin or preview-as-user (%s)",
  (preview) => {
    useConsoleStore.setState({ previewAsUser: preview });
    render(
      <CustomerAnalyticsAccess
        user={
          {
            user_id: "u1",
            role: preview ? "admin" : "user",
            is_admin: preview,
          } as User
        }
      />,
    );
    expect(useCustomerAnalytics).not.toHaveBeenCalled();
  },
);
