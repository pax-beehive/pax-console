/* @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationLifecycle } from "./notification-lifecycle";
import { runSignOutCleanups } from "@/features/api/logout-cleanup";
const f = vi.hoisted(() => ({
  supported: true,
  bound: true,
  request: vi.fn(),
  reconcile: vi.fn(async () => "enabled"),
  disable: vi.fn(async () => "off"),
}));
vi.mock("./push-client", () => ({
  notificationBase: "/api/v1/user/self/notifications",
  pushBindingKey: "binding",
  pushSupported: () => f.supported,
  readPushBinding: () => (f.bound ? { owner: "user" } : null),
  PushClient: class {
    reconcile = f.reconcile;
    disable = f.disable;
  },
}));
vi.mock("@/features/api/client", () => ({ apiFetch: () => f.request() }));
let worker: EventTarget;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  f.supported = true;
  f.bound = true;
  f.request.mockResolvedValue({ enabled: true });
  worker = new EventTarget();
  vi.stubGlobal("navigator", { onLine: true, serviceWorker: worker });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
function mount() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NotificationLifecycle userId="user" />
    </QueryClientProvider>,
  );
}
describe("notification lifecycle", () => {
  it("repairs an opted-in foreground device without polling or re-prompting", async () => {
    mount();
    await waitFor(() => expect(f.reconcile).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(f.request).toHaveBeenCalledOnce();
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "pax:push-subscription-changed" },
      }),
    );
    await waitFor(() => expect(f.reconcile).toHaveBeenCalledTimes(2));
    await runSignOutCleanups();
    expect(f.disable).toHaveBeenCalledOnce();
  });
  it("does not register or fetch on a browser without opt-in", async () => {
    f.bound = false;
    mount();
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("defers subscription-change repair while the window is unfocused", async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    mount();
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "pax:push-subscription-changed" },
      }),
    );
    await Promise.resolve();
    expect(f.request).not.toHaveBeenCalled();
  });
});
