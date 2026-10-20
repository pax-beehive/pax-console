// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SubscriptionDashboard,
  SubscriptionDashboardAccess,
} from "./subscription-dashboard";
import { useSubscriptions } from "@/features/analytics/use-subscriptions";
import { useConsoleStore } from "@/stores/console-store";
import { AuthError } from "@/features/api/errors";
import type { User } from "@/features/api/types";
import type { PushReceiver } from "@/features/analytics/subscription-data";
import { Sidebar } from "@/components/shell/sidebar";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => "/admin/notifications",
}));
vi.mock("@/features/analytics/use-subscriptions", () => ({
  useSubscriptions: vi.fn(),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit";
  }) => (
    <button type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/text", () => ({
  MonoId: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const row: PushReceiver = {
  receiver_id: "nrecv_one",
  user_id: "u1",
  email: "one@example.invalid",
  device_label: "Pixel",
  channel: "web_push",
  revision: 1,
  status: "enabled",
  permission: "granted",
  permission_reported_at: "2026-10-19T00:00:00Z",
  created_at: "2026-10-19T00:00:00Z",
  last_registered_at: "2026-10-19T00:00:00Z",
  latest_delivery: null,
};
let result: ReturnType<typeof useSubscriptions>;
beforeEach(() => {
  navigation.search = "";
  vi.stubGlobal("React", React);
  useConsoleStore.setState({ previewAsUser: false });
  result = {
    data: {
      regions: [
        {
          region: "us",
          available: true,
          updated_at: "2026-10-19T00:00:00Z",
          summary: {
            total: 100,
            enabled: 80,
            disabled: 10,
            revoked: 5,
            expired: 5,
            invalidated: 0,
            enabled_users: 30,
          },
          receivers: [row],
          next_cursor: "next-us",
        },
        { region: "hk", available: false, error: "unavailable" },
      ],
    },
    isError: false,
    error: null,
    focused: true,
    isFetching: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSubscriptions>;
  vi.mocked(useSubscriptions).mockImplementation(() => result);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "Given a non-admin or preview-as-user (%s), never mounts the protected query",
  (preview) => {
    useConsoleStore.setState({ previewAsUser: preview });
    render(
      <SubscriptionDashboardAccess
        user={
          {
            user_id: "u1",
            role: preview ? "admin" : "user",
            is_admin: preview,
          } as User
        }
      />,
    );
    expect(useSubscriptions).not.toHaveBeenCalled();
    expect(
      screen.getByText("Push subscriptions are available to administrators."),
    ).toBeTruthy();
  },
);

it("Given a partial snapshot, shows full totals, truthful statuses and receiver details", () => {
  render(<SubscriptionDashboard userId="admin" />);
  expect(screen.getByText("100")).toBeTruthy();
  expect(screen.getAllByText("Partial / stale snapshot")).toHaveLength(6);
  expect(
    screen.getByText(
      "This region is unavailable. Its subscriptions are not counted as zero.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("No delivery attempts")).toBeTruthy();
  expect(
    screen.getByRole("navigation", { name: "Customer administration" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  const detail = screen.getByRole("region", { name: "Receiver details" });
  expect(within(detail).getByText("nrecv_one")).toBeTruthy();
  expect(within(detail).getByText("Permission reported")).toBeTruthy();
  expect(detail.textContent).not.toContain("endpoint");
});

it("Given filters and per-region pagination, starts a query with matching parameters", () => {
  render(<SubscriptionDashboard userId="admin" />);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(vi.mocked(useSubscriptions).mock.lastCall?.[1].cursors.us).toBe(
    "next-us",
  );
  fireEvent.change(screen.getByLabelText("Subscription status"), {
    target: { value: "disabled" },
  });
  expect(vi.mocked(useSubscriptions).mock.lastCall?.[1]).toMatchObject({
    status: "disabled",
    cursors: {},
  });
  fireEvent.change(screen.getByLabelText("Search subscriptions"), {
    target: { value: "pixel" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(vi.mocked(useSubscriptions).mock.lastCall?.[1].search).toBe("pixel");
});

it("Given an authorization denial, hides previously cached rows and summary counts", () => {
  result = {
    ...result,
    isError: true,
    error: new AuthError(),
  } as typeof result;
  render(<SubscriptionDashboard userId="admin" />);
  expect(screen.queryByText("one@example.invalid")).toBeNull();
  expect(screen.queryByText("100")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(
    "Previously loaded data is hidden",
  );
});

it("Given provider acceptance, never labels it as displayed or read", () => {
  result.data!.regions[0].receivers![0] = {
    ...row,
    latest_delivery: {
      status: "accepted",
      attempts: 1,
      attempted_at: "2026-10-19T00:00:00Z",
      provider_status: 201,
    },
  };
  render(<SubscriptionDashboard userId="admin" />);
  expect(screen.getByText("Provider accepted")).toBeTruthy();
  expect(screen.queryByText("Delivered")).toBeNull();
});

it("Given registration is not configured, distinguishes it from an empty registry", () => {
  result.data!.regions[0].registration_enabled = false;
  render(<SubscriptionDashboard userId="admin" />);
  expect(
    screen.getByText("Push registration is not configured in this region."),
  ).toBeTruthy();
  expect(screen.getByText("one@example.invalid")).toBeTruthy();
});

it("Given a local customer link, preserves the development region and allows clearing the customer scope", () => {
  navigation.search = "region=local&user_id=u1";
  render(<SubscriptionDashboard userId="admin" />);
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe(
    "local",
  );
  expect(vi.mocked(useSubscriptions).mock.lastCall?.[1]).toMatchObject({
    region: "local",
    userId: "u1",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Clear customer filter" }),
  );
  expect(vi.mocked(useSubscriptions).mock.lastCall?.[1].userId).toBe("");
});

it("Given refreshed receiver metadata, updates an already open detail view", () => {
  const view = render(<SubscriptionDashboard userId="admin" />);
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  result = {
    ...result,
    data: {
      regions: [
        {
          ...result.data!.regions[0],
          receivers: [{ ...row, status: "disabled" }],
        },
      ],
    },
  } as typeof result;
  view.rerender(<SubscriptionDashboard userId="admin" />);
  expect(
    within(screen.getByRole("region", { name: "Receiver details" })).getByText(
      "disabled",
    ),
  ).toBeTruthy();
});

it.each([true, false])(
  "Given administrator navigation (%s), places subscription access beside Customers",
  (admin) => {
    useConsoleStore.setState({ sidebarCollapsed: false });
    render(<Sidebar showAdminFeatures={admin} />);
    expect(
      Boolean(screen.queryByRole("link", { name: "Push subscriptions" })),
    ).toBe(admin);
    expect(Boolean(screen.queryByRole("link", { name: "Customers" }))).toBe(
      admin,
    );
  },
);
