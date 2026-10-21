import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function fixture() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const client = {
    url: "https://pax.example.invalid/",
    frameType: "top-level",
    navigate: vi.fn(async () => client),
    focus: vi.fn(async () => client),
    postMessage: vi.fn(),
  };
  const showNotification = vi.fn<
    (title: string, options: unknown) => Promise<void>
  >(async () => {});
  const clients = {
    matchAll: vi.fn(async () => [client]),
    openWindow: vi.fn<(target: string) => Promise<null>>(async () => null),
    claim: vi.fn(async () => {}),
  };
  runInNewContext(
    readFileSync(
      new URL("../../../public/push-sw.js", import.meta.url),
      "utf8",
    ),
    {
      URL,
      self: {
        location: { origin: "https://pax.example.invalid" },
        registration: { showNotification },
        clients,
        skipWaiting: vi.fn(async () => {}),
        addEventListener: (
          type: string,
          callback: (event: Record<string, unknown>) => void,
        ) => listeners.set(type, callback),
      },
    },
  );
  return {
    client,
    clients,
    showNotification,
    listeners,
    fire: async (type: string, event: Record<string, unknown>) => {
      let pending: Promise<unknown> | undefined;
      listeners.get(type)!({
        ...event,
        waitUntil: (work: Promise<unknown>) => {
          pending = work;
        },
      });
      await pending;
    },
  };
}
describe("push service worker", () => {
  it("shows a bounded reply preview and deduplicates by stable ID", async () => {
    const f = fixture();
    await f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          notification_id: `ntf_${"a".repeat(64)}`,
          title: "ignored title",
          body: "Final reply\n\twith a preview.",
          url: "/?session_id=one",
        }),
      },
    });
    expect(f.showNotification).toHaveBeenCalledWith(
      "Pax Workspace",
      expect.objectContaining({
        body: "Final reply with a preview.",
        badge: "/pax-notification-badge.png",
        icon: "/pax-app-icon.png",
        tag: `ntf_${"a".repeat(64)}`,
        renotify: false,
        data: { url: "/?session_id=one" },
      }),
    );
    expect(JSON.stringify(f.showNotification.mock.calls)).not.toContain(
      "ignored title",
    );
    expect(f.listeners.has("fetch")).toBe(false);
  });
  it("bounds Unicode previews and keeps generic text for missing or invalid bodies", async () => {
    const f = fixture();
    for (const body of [null, {}, 42, "\n\u0000\t", undefined]) {
      await f.fire("push", {
        data: { json: () => ({ version: 1, type: "turn.completed", body }) },
      });
      expect(f.showNotification).toHaveBeenLastCalledWith(
        "Pax Workspace",
        expect.objectContaining({ body: "Your turn has finished." }),
      );
    }
    await f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          body: "😀".repeat(250),
        }),
      },
    });
    expect(f.showNotification).toHaveBeenLastCalledWith(
      "Pax Workspace",
      expect.objectContaining({ body: "😀".repeat(199) + "…" }),
    );
  });
  it("shows a safe fallback for malformed payloads and never navigates outside approved paths", async () => {
    const f = fixture();
    for (const url of [
      "https://attacker.invalid",
      "//attacker.invalid",
      "/auth/logout",
      "/\\attacker.invalid",
      "/sessions/one\n",
      "/%zz",
      "/",
      "/?session_id=",
      "/?session_id=one&session_id=two",
      "/?session_id=%00one",
      "/?session_id=%20one",
      "/?session_id=" + "a".repeat(513),
      "/sessions/%zz",
    ]) {
      await f.fire("push", {
        data: { json: () => ({ version: 1, type: "notification.test", url }) },
      });
      expect(f.showNotification).toHaveBeenLastCalledWith(
        "Pax Workspace",
        expect.objectContaining({ data: { url: "/settings/notifications" } }),
      );
    }
    await f.fire("push", {
      data: {
        json: () => {
          throw new Error("bad data");
        },
      },
    });
    expect(f.showNotification).toHaveBeenLastCalledWith(
      "Pax Workspace",
      expect.objectContaining({ body: "You have a new notification." }),
    );
    await f.fire("push", { data: { json: () => null } });
    await f.fire("push", {});
  });
  it("normalizes older notification links into Home session links", async () => {
    const f = fixture();
    for (const url of [
      "/sessions/one?agentId=a&nodeId=n",
      "/?session_id=one&prompt=discarded",
    ]) {
      await f.fire("push", {
        data: { json: () => ({ version: 1, type: "turn.completed", url }) },
      });
      expect(f.showNotification).toHaveBeenLastCalledWith(
        "Pax Workspace",
        expect.objectContaining({ data: { url: "/?session_id=one" } }),
      );
    }
    await f.fire("notificationclick", {
      notification: {
        close: vi.fn(),
        data: { url: "/sessions/one?agentId=a&nodeId=n" },
      },
    });
    expect(f.client.navigate).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=one",
    );
  });
  it("preserves encoded opaque session IDs without changing the Home route", async () => {
    const f = fixture();
    await f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          url: "/?session_id=one%2Ftwo%3Fquery%23fragment",
        }),
      },
    });
    expect(f.showNotification).toHaveBeenLastCalledWith(
      "Pax Workspace",
      expect.objectContaining({
        data: { url: "/?session_id=one%2Ftwo%3Fquery%23fragment" },
      }),
    );
  });
  it("focuses an existing window or opens a new authenticated route", async () => {
    const f = fixture();
    const close = vi.fn();
    await f.fire("notificationclick", {
      notification: { close, data: { url: "/?session_id=one" } },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(f.client.navigate).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=one",
    );
    expect(f.client.focus).toHaveBeenCalledOnce();
    expect(f.client.focus.mock.invocationCallOrder[0]).toBeLessThan(
      f.client.navigate.mock.invocationCallOrder[0],
    );
    f.clients.matchAll.mockResolvedValue([]);
    await f.fire("notificationclick", {
      notification: { close, data: { url: "https://attacker.invalid" } },
    });
    expect(f.clients.openWindow).toHaveBeenCalledWith(
      "https://pax.example.invalid/settings/notifications",
    );
  });
  it("navigates even when the creation URL matches because Home may have switched sessions", async () => {
    const f = fixture();
    const exact = {
      ...f.client,
      url: "https://pax.example.invalid/?session_id=one",
      navigate: vi.fn(async () => exact),
      focus: vi.fn(async () => exact),
    };
    f.clients.matchAll.mockResolvedValue([f.client, exact]);
    await f.fire("notificationclick", {
      notification: {
        close: vi.fn(),
        data: { url: "/?session_id=one" },
      },
    });
    expect(exact.focus).toHaveBeenCalledOnce();
    expect(exact.navigate).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=one",
    );
    expect(f.client.navigate).not.toHaveBeenCalled();
    expect(f.clients.openWindow).not.toHaveBeenCalled();
  });
  it.each([
    "focus rejection",
    "navigation rejection",
    "navigation returns null",
    "window lookup rejection",
  ])("opens the session when reuse fails: %s", async (scenario) => {
    const f = fixture();
    if (scenario === "focus rejection")
      f.client.focus.mockRejectedValue(new Error("closed"));
    if (scenario === "navigation rejection")
      f.client.navigate.mockRejectedValue(new Error("closed"));
    if (scenario === "navigation returns null")
      f.client.navigate.mockResolvedValue(null as never);
    if (scenario === "window lookup rejection")
      f.clients.matchAll.mockRejectedValue(new Error("unavailable"));
    await f.fire("notificationclick", {
      notification: {
        close: vi.fn(),
        data: { url: "/?session_id=one" },
      },
    });
    expect(f.clients.openWindow).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=one",
    );
  });
  it("does not reuse an embedded window or a different origin", async () => {
    const f = fixture();
    f.clients.matchAll.mockResolvedValue([
      { ...f.client, frameType: "nested" },
      { ...f.client, url: "https://other.example.invalid/" },
    ]);
    await f.fire("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/?session_id=one" } },
    });
    expect(f.client.navigate).not.toHaveBeenCalled();
    expect(f.clients.openWindow).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=one",
    );
  });
  it("claims clients on upgrade and asks open clients to reconcile changed subscriptions", async () => {
    const f = fixture();
    await f.fire("install", {});
    await f.fire("activate", {});
    await f.fire("pushsubscriptionchange", {});
    expect(f.clients.claim).toHaveBeenCalledOnce();
    expect(f.client.postMessage).toHaveBeenCalledWith({
      type: "pax:push-subscription-changed",
    });
  });
});
