/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  PushBinding,
  PushConfig,
  PushState,
} from "@/features/notifications/push-client";
import { NotificationSettings } from "./notification-settings";

const f = vi.hoisted(() => ({
  supported: true,
  binding: null as PushBinding | null,
  state: "off" as PushState,
  configured: true,
  failRead: false,
  automatic: false,
  enable: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/features/notifications/push-client", () => ({
  notificationBase: "/api/v1/user/self/notifications",
  pushSupported: () => f.supported,
  readPushBinding: () => f.binding,
  PushClient: class {
    reconcile = async (config: PushConfig) =>
      config.test_enabled ? f.state : "unconfigured";
    enable = f.enable;
    disable = f.disable;
    test = f.test;
  },
}));
vi.mock("@/features/api/client", () => ({
  apiFetch: (path: string) => f.fetch(path),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.supported = true;
  f.binding = null;
  f.state = "off";
  f.configured = true;
  f.failRead = false;
  f.automatic = false;
  f.fetch.mockImplementation(async (path: string) => {
    if (f.failRead) throw new Error("offline");
    if (path.endsWith("/config"))
      return {
        enabled: f.configured,
        test_enabled: f.configured,
        public_key: "public",
        key_id: "key",
        channel: "web_push",
        turn_completion_enabled: f.automatic,
      };
    return {
      regions: [
        {
          region: "local",
          available: true,
          receivers: f.binding
            ? [
                {
                  receiver_id: "receiver",
                  status: "enabled",
                  latest_delivery: null,
                },
              ]
            : [],
        },
      ],
    };
  });
  f.enable.mockImplementation(async () => {
    f.binding = {
      owner: "user",
      receiver_id: "receiver",
      key_id: "key",
      enabled: true,
    };
    return "enabled";
  });
  f.disable.mockImplementation(async () => {
    f.binding = null;
    return "off";
  });
  f.test.mockResolvedValue({ delivery: { status: "pending" } });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NotificationSettings userId="user" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
describe("notification settings", () => {
  it("explains the supported session scope when automatic notifications are available", async () => {
    f.automatic = true;
    mount();
    await screen.findByText(
      /Automatic notifications are enabled for standard sessions/,
    );
    expect(
      screen.getByText(/Encrypted sessions are not supported yet/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Automatic turn alerts are not available/),
    ).not.toBeInTheDocument();
  });
  it("lets the user enable this device and queue a real test", async () => {
    mount();
    const enable = await screen.findByRole("button", {
      name: "Enable notifications",
    });
    await waitFor(() => expect(enable).toBeEnabled());
    fireEvent.click(enable);
    expect(f.enable).toHaveBeenCalledOnce();
    const test = await screen.findByRole("button", {
      name: "Send test notification",
    });
    fireEvent.click(test);
    await screen.findByText(/Test notification queued/);
    expect(f.test).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Turn off on this device" }),
    );
    await screen.findByText("Notifications are off on this device.");
    expect(f.disable).toHaveBeenCalledOnce();
  });
  it("does not query or prompt on unsupported browsers", async () => {
    f.supported = false;
    mount();
    await screen.findByText(/This browser does not support/);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Enable notifications" }),
    ).not.toBeInTheDocument();
  });
  it("explains server configuration and blocks enable until sending is available", async () => {
    f.configured = false;
    mount();
    await screen.findByText(/not configured on the server/);
    expect(
      screen.getByRole("button", { name: "Enable notifications" }),
    ).toBeDisabled();
    expect(f.enable).not.toHaveBeenCalled();
  });
  it("explains denied system permission without claiming the receiver is enabled", async () => {
    f.state = "denied";
    mount();
    await screen.findByText(/Notifications are blocked/);
    expect(
      screen.getByRole("button", { name: "Enable notifications" }),
    ).toBeDisabled();
  });
  it("shows read failures and retains an explicit retry", async () => {
    f.failRead = true;
    mount();
    await screen.findByText("Notification status is temporarily unavailable.");
    expect(
      screen.getByRole("button", { name: "Enable notifications" }),
    ).toBeDisabled();
    f.failRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByText("Notifications are off on this device.");
  });
  it("shows test rejection without fabricating delivery success", async () => {
    f.state = "enabled";
    f.binding = {
      owner: "user",
      receiver_id: "receiver",
      key_id: "key",
      enabled: true,
    };
    f.test.mockRejectedValue(new Error("wait 30 seconds"));
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Send test notification" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "wait 30 seconds",
    );
    expect(
      screen.queryByText(/Test notification queued/),
    ).not.toBeInTheDocument();
  });
});
