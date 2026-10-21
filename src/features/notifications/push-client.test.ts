import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PushClient,
  type PushBinding,
  type PushPlatform,
  type PushConfig,
} from "./push-client";

const publicKey = btoa(String.fromCharCode(4, ...new Uint8Array(64))).replace(
  /=/g,
  "",
);
const config: PushConfig = {
  enabled: true,
  test_enabled: true,
  turn_completion_enabled: false,
  public_key: publicKey,
  key_id: "key",
  channel: "web_push",
};
function fixture() {
  let binding: PushBinding | null = null;
  let permission: NotificationPermission = "granted";
  let subscription: PushSubscription | null = null;
  let serverStatus = "enabled";
  const request = vi.fn().mockImplementation(async (path: string) => {
    if (path.endsWith("/me")) return { user: { user_id: "user" } };
    if (path.includes("/receivers?"))
      return {
        regions: [
          {
            receivers: binding
              ? [
                  {
                    receiver_id: binding.receiver_id,
                    user_id: "user",
                    status: serverStatus,
                  },
                ]
              : [],
          },
        ],
      };
    return {
      receiver: { receiver_id: "receiver", status: "enabled", user_id: "user" },
    };
  });
  const unsubscribe = vi.fn(async () => {
    subscription = null;
    return true;
  });
  const create = () =>
    ({
      options: {
        applicationServerKey: Uint8Array.from(atob(publicKey), (c) =>
          c.charCodeAt(0),
        ).buffer,
      },
      unsubscribe,
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/push/device",
        keys: { auth: "secret", p256dh: "key" },
      }),
    }) as unknown as PushSubscription;
  const subscribe = vi.fn(async () => {
    subscription = create();
    return subscription;
  });
  const platform: PushPlatform = {
    supported: () => true,
    permission: () => permission,
    requestPermission: vi.fn(async () => permission),
    registration: vi.fn(
      async () =>
        ({
          pushManager: { getSubscription: async () => subscription, subscribe },
        }) as unknown as ServiceWorkerRegistration,
    ),
    readBinding: () => binding,
    writeBinding: (value) => {
      binding = value;
    },
    label: () => "Android browser",
  };
  const client = new PushClient("user", platform, request);
  return {
    client,
    platform,
    request,
    subscribe,
    unsubscribe,
    binding: () => binding,
    setBinding: (value: PushBinding) => {
      binding = value;
      subscription = create();
    },
    setPermission: (value: NotificationPermission) => {
      permission = value;
    },
    setServerStatus: (value: string) => {
      serverStatus = value;
    },
  };
}

describe("device notification subscription", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requests permission only for an explicit enable action and registers the browser subscription", async () => {
    const f = fixture();
    expect(await f.client.reconcile(config)).toBe("off");
    expect(f.platform.requestPermission).not.toHaveBeenCalled();
    const pending = f.client.enable(config);
    expect(f.platform.requestPermission).toHaveBeenCalledOnce();
    expect(await pending).toBe("enabled");
    expect(f.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(f.request).toHaveBeenCalledWith(
      expect.stringContaining("/receivers/web-push"),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(f.binding()).toMatchObject({
      owner: "user",
      receiver_id: "receiver",
      key_id: "key",
      enabled: true,
    });
  });
  it("does not prompt or register when the service is unconfigured or permission is denied", async () => {
    const f = fixture();
    await expect(
      f.client.enable({ ...config, test_enabled: false }),
    ).rejects.toThrow(/configured/);
    expect(f.platform.requestPermission).not.toHaveBeenCalled();
    f.setPermission("denied");
    expect(await f.client.enable(config)).toBe("denied");
    expect(f.subscribe).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
  it("reconciles an opted-in receiver without prompting", async () => {
    const f = fixture();
    f.setBinding({
      owner: "user",
      receiver_id: "old",
      key_id: "key",
      enabled: true,
    });
    expect(await f.client.reconcile(config)).toBe("enabled");
    expect(f.platform.requestPermission).not.toHaveBeenCalled();
    expect(f.subscribe).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2);
  });
  it("unsubscribes an old account before a new account can bind the endpoint", async () => {
    const f = fixture();
    f.setBinding({
      owner: "other",
      receiver_id: "old",
      key_id: "key",
      enabled: true,
    });
    expect(await f.client.reconcile(config)).toBe("off");
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledWith("/api/v1/user/self/me");
    expect(f.binding()).toBeNull();
  });
  it("rotates a changed application key by revoking and replacing the old subscription", async () => {
    const f = fixture();
    f.setBinding({
      owner: "user",
      receiver_id: "old",
      key_id: "old-key",
      enabled: true,
    });
    await f.client.reconcile(config);
    expect(f.request.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.subscribe).toHaveBeenCalledOnce();
  });
  it("revokes remotely and unsubscribes locally on disable", async () => {
    const f = fixture();
    await f.client.enable(config);
    f.request.mockClear();
    expect(await f.client.disable()).toBe("off");
    expect(f.request).toHaveBeenCalledWith(
      expect.stringContaining("/receivers/receiver"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.binding()).toBeNull();
  });
  it("keeps a failed disable opted out and still unsubscribes locally", async () => {
    const f = fixture();
    await f.client.enable(config);
    f.request.mockRejectedValue(new Error("offline"));
    await expect(f.client.disable()).rejects.toThrow("offline");
    expect(f.binding()?.enabled).toBe(false);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("unsubscribes a newly created subscription if server registration fails", async () => {
    const f = fixture();
    f.request.mockRejectedValue(new Error("offline"));
    await expect(f.client.enable(config)).rejects.toThrow("offline");
    expect(f.binding()).toBeNull();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("queues a test only for the current owner's enabled receiver", async () => {
    const f = fixture();
    await expect(f.client.test()).rejects.toThrow(/Enable/);
    await f.client.enable(config);
    f.request.mockClear();
    await f.client.test();
    expect(f.request).toHaveBeenCalledWith(
      expect.stringContaining("/receivers/receiver/test"),
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("honors a server-side revoke without silently enabling it again", async () => {
    const f = fixture();
    f.setBinding({
      owner: "user",
      receiver_id: "old",
      key_id: "key",
      enabled: true,
    });
    f.setServerStatus("revoked");
    expect(await f.client.reconcile(config)).toBe("off");
    expect(f.subscribe).not.toHaveBeenCalled();
    expect(f.binding()).toBeNull();
  });
  it("repairs an invalidated subscription by replacing it without a new permission prompt", async () => {
    const f = fixture();
    f.setBinding({
      owner: "user",
      receiver_id: "old",
      key_id: "key",
      enabled: true,
    });
    f.setServerStatus("invalidated");
    expect(await f.client.reconcile(config)).toBe("enabled");
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.subscribe).toHaveBeenCalledOnce();
    expect(f.platform.requestPermission).not.toHaveBeenCalled();
  });
  it("rejects a registration response from a changed authenticated account", async () => {
    const f = fixture();
    f.request.mockResolvedValue({
      receiver: {
        receiver_id: "receiver",
        status: "enabled",
        user_id: "other",
      },
    });
    await expect(f.client.enable(config)).rejects.toThrow(/account changed/);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.binding()).toBeNull();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("native worker readiness", () => {
  function nativeFixture(ready: Promise<ServiceWorkerRegistration>) {
    const subscribe = vi.fn();
    const register = vi.fn(async () => ({ pushManager: { subscribe } }));
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      isSecureContext: true,
      Notification: {},
      PushManager: {},
    });
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(async () => "granted"),
    });
    vi.stubGlobal("navigator", {
      userAgent: "Android",
      serviceWorker: { register, ready },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const request = vi.fn().mockResolvedValue({
      receiver: { receiver_id: "native", user_id: "user", status: "enabled" },
    });
    return {
      client: new PushClient("user", undefined, request),
      subscribe,
      register,
      request,
    };
  }
  it("waits for an active worker before subscribing on first install", async () => {
    let activate!: (value: ServiceWorkerRegistration) => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => {
      activate = resolve;
    });
    const f = nativeFixture(ready);
    const subscription = {
      toJSON: () => ({}),
      unsubscribe: vi.fn(async () => true),
    };
    const subscribe = vi.fn(async () => subscription);
    const pending = f.client.enable(config);
    await vi.waitFor(() => expect(f.register).toHaveBeenCalledOnce());
    expect(f.request).not.toHaveBeenCalled();
    activate({
      pushManager: { getSubscription: async () => null, subscribe },
    } as unknown as ServiceWorkerRegistration);
    expect(await pending).toBe("enabled");
    expect(subscribe).toHaveBeenCalledOnce();
  });
  it("bounds worker activation without uploading an unusable registration", async () => {
    vi.useFakeTimers();
    const f = nativeFixture(new Promise(() => {}));
    const pending = expect(f.client.enable(config)).rejects.toThrow(
      /timed out/,
    );
    await vi.advanceTimersByTimeAsync(10001);
    await pending;
    expect(f.request).not.toHaveBeenCalled();
  });
});
