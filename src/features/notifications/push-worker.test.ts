import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type ReadRecord = { id: string; readAt: number };
function readDatabase(records: Map<string, ReadRecord>) {
  // Minimal asynchronous IDB fixture. The browser audit exercises real IndexedDB.
  return {
    open: () => {
      const request: Record<string, unknown> = {};
      const database = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: () => {
          const transaction: Record<string, unknown> = {
            objectStore: () => ({
              put: (record: ReadRecord) => records.set(record.id, record),
              delete: (id: string) => records.delete(id),
              getAll: () => {
                const read: Record<string, unknown> = {};
                queueMicrotask(() => {
                  read.result = [...records.values()];
                  (read.onsuccess as () => void)();
                  queueMicrotask(() =>
                    (transaction.oncomplete as () => void)(),
                  );
                });
                return read;
              },
            }),
          };
          return transaction;
        },
      };
      queueMicrotask(() => {
        request.result = database;
        (request.onsuccess as () => void)();
      });
      return request;
    },
  };
}
function fixture(
  records = new Map<string, ReadRecord>(),
  storageAvailable = true,
) {
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
  const notifications: {
    tag: string;
    data?: unknown;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const getNotifications = vi.fn(async () => notifications);
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
      Date,
      indexedDB: storageAvailable ? readDatabase(records) : undefined,
      self: {
        location: { origin: "https://pax.example.invalid" },
        registration: { showNotification, getNotifications },
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
    getNotifications,
    notifications,
    records,
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
  it.each([
    ["turn.completed", "A reply from the earlier session."],
    [
      "approval.required",
      "Your session is waiting for your approval. Tap to review the request.",
    ],
    ["notification.test", "Notifications are working on this device."],
  ])(
    "sets the original system timestamp for a delayed %s without changing its text or clearing it",
    async (type, content) => {
      const f = fixture(new Map(), false);
      const occurred = Date.now() - 2 * 3600_000;
      const id = `ntf_${"e".repeat(64)}`;
      f.notifications.push({ tag: id, close: vi.fn() });
      await f.fire("push", {
        data: {
          json: () => ({
            version: 1,
            type,
            notification_id: id,
            occurred_at: occurred,
            body: "A reply from the earlier session.",
            url: "/?session_id=earlier",
          }),
        },
      });
      const options = f.showNotification.mock
        .calls[0][1] as NotificationOptions & { timestamp?: number };
      expect(options.timestamp).toBe(occurred);
      expect(options.body).toBe(content);
      expect(options.data.url).toBe("/?session_id=earlier");
      expect(options.silent).not.toBe(true);
      expect(f.notifications[0].close).not.toHaveBeenCalled();
      await f.fire("notificationclick", {
        notification: { close: vi.fn(), data: options.data },
      });
      expect(f.client.navigate).toHaveBeenCalledWith(
        "https://pax.example.invalid/?session_id=earlier",
      );
    },
  );
  it.each([
    undefined,
    null,
    "2026-10-26",
    "0",
    -1,
    0,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    8_640_000_000_000_001,
  ])(
    "keeps legacy text when the original time is unavailable or invalid: %s",
    async (occurred) => {
      const f = fixture();
      await f.fire("push", {
        data: {
          json: () => ({
            version: 1,
            type: "turn.completed",
            occurred_at: occurred,
            body: "Legacy reply",
          }),
        },
      });
      const options = f.showNotification.mock
        .calls[0][1] as NotificationOptions & { timestamp?: number };
      expect(options.body).toBe("Legacy reply");
      expect(options.timestamp).toBeUndefined();
    },
  );
  it("shows an approval reminder and opens the session for review", async () => {
    const f = fixture();
    await f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "approval.required",
          notification_id: `ntf_${"4".repeat(64)}`,
          body: "private command",
          url: "/?session_id=waiting",
        }),
      },
    });
    expect(f.showNotification).toHaveBeenCalledWith(
      "Approval needed",
      expect.objectContaining({
        body: "Your session is waiting for your approval. Tap to review the request.",
        data: { url: "/?session_id=waiting" },
      }),
    );
    await f.fire("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/?session_id=waiting" } },
    });
    expect(f.client.navigate).toHaveBeenCalledWith(
      "https://pax.example.invalid/?session_id=waiting",
    );
  });
  const oldId = `ntf_${"1".repeat(64)}`;
  const newerId = `ntf_${"2".repeat(64)}`;
  const otherId = `ntf_${"3".repeat(64)}`;
  it("fails open on storage errors while still closing an explicitly read displayed turn", async () => {
    const f = fixture(new Map(), false);
    f.notifications.push({ tag: oldId, close: vi.fn() });
    await f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          notification_id: oldId,
        }),
      },
    });
    expect(f.showNotification).toHaveBeenCalledOnce();
    expect(f.notifications[0].close).not.toHaveBeenCalled();
    await f.fire("message", {
      source: f.client,
      data: { type: "pax:read-turn-notifications", ids: [oldId] },
    });
    expect(f.notifications[0].close).toHaveBeenCalledOnce();
    f.getNotifications.mockRejectedValueOnce(new Error("OS unavailable"));
    await expect(
      f.fire("message", {
        source: f.client,
        data: { type: "pax:read-turn-notifications", ids: [oldId] },
      }),
    ).resolves.toBeUndefined();
  });
  it("closes precisely the read turn, retaining newer turns, other sessions and manual tests", async () => {
    const f = fixture();
    for (const tag of [oldId, newerId, otherId, "manual-test"])
      f.notifications.push({ tag, close: vi.fn() });
    await f.fire("message", {
      source: f.client,
      data: { type: "pax:read-turn-notifications", ids: [oldId] },
    });
    expect(f.notifications[0].close).toHaveBeenCalledOnce();
    for (const notification of f.notifications.slice(1))
      expect(notification.close).not.toHaveBeenCalled();
    expect([...f.records.keys()]).toEqual([oldId]);
  });
  it("remembers read turns across worker restarts and closes late pushes after displaying them", async () => {
    const first = fixture();
    await first.fire("message", {
      source: first.client,
      data: { type: "pax:read-turn-notifications", ids: [oldId] },
    });
    const restarted = fixture(first.records);
    restarted.notifications.push({ tag: oldId, close: vi.fn() });
    await restarted.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          notification_id: oldId,
          url: "/?session_id=one",
        }),
      },
    });
    expect(restarted.showNotification).toHaveBeenCalledOnce();
    expect(restarted.notifications[0].close).toHaveBeenCalledOnce();
    expect(restarted.showNotification.mock.invocationCallOrder[0]).toBeLessThan(
      restarted.notifications[0].close.mock.invocationCallOrder[0],
    );
  });
  it("handles a read arriving while showNotification is pending", async () => {
    const f = fixture();
    let release!: () => void;
    f.showNotification.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            f.notifications.push({ tag: oldId, close: vi.fn() });
            resolve();
          };
        }),
    );
    const pending = f.fire("push", {
      data: {
        json: () => ({
          version: 1,
          type: "turn.completed",
          notification_id: oldId,
        }),
      },
    });
    await f.fire("message", {
      source: f.client,
      data: { type: "pax:read-turn-notifications", ids: [oldId] },
    });
    release();
    await pending;
    expect(f.notifications[0].close).toHaveBeenCalledOnce();
  });
  it("rejects invalid identities and non-app message sources", async () => {
    const f = fixture();
    for (const source of [
      null,
      { ...f.client, url: "https://attacker.invalid" },
      { ...f.client, frameType: "nested" },
    ])
      await f.fire("message", {
        source,
        data: { type: "pax:read-turn-notifications", ids: [oldId] },
      });
    await f.fire("message", {
      source: f.client,
      data: {
        type: "pax:read-turn-notifications",
        ids: ["all", null, {}, "ntf_bad"],
      },
    });
    expect(f.records.size).toBe(0);
    expect(f.getNotifications).not.toHaveBeenCalled();
  });
  it("expires and bounds local read receipts without storing conversation content", async () => {
    const records = new Map<string, ReadRecord>([
      [otherId, { id: otherId, readAt: Date.now() - 25 * 3600_000 }],
    ]);
    const f = fixture(records);
    for (let i = 0; i < 520; i++) {
      const id = `ntf_${i.toString(16).padStart(64, "0")}`;
      records.set(id, { id, readAt: Date.now() - 1000 });
    }
    await f.fire("message", {
      source: f.client,
      data: { type: "pax:read-turn-notifications", ids: [oldId] },
    });
    expect(records.size).toBeLessThanOrEqual(512);
    expect(records.has(otherId)).toBe(false);
    expect(records.get(oldId)).toEqual({
      id: oldId,
      readAt: expect.any(Number),
    });
  });
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
