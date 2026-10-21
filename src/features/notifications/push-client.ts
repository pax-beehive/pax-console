import { apiFetch } from "@/features/api/client";

export const notificationBase = "/api/v1/user/self/notifications";
export const pushBindingKey = "pax:push-binding:v1";
export type PushConfig = {
  enabled: boolean;
  test_enabled: boolean;
  turn_completion_enabled: boolean;
  public_key: string;
  key_id: string;
  channel: string;
};
export type PushBinding = {
  owner: string;
  receiver_id: string;
  key_id: string;
  enabled: boolean;
};
export type PushState =
  | "unsupported"
  | "unconfigured"
  | "off"
  | "default"
  | "denied"
  | "enabled";
export type PushPlatform = {
  supported(): boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  registration(): Promise<ServiceWorkerRegistration>;
  existingRegistration?(): Promise<ServiceWorkerRegistration | undefined>;
  readBinding(): PushBinding | null;
  writeBinding(value: PushBinding | null): void;
  label(): string;
};
type PushRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
let operations: Promise<unknown> = Promise.resolve();
let intent = 0;
let pendingRegistrations = 0;

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
export function readPushBinding(): PushBinding | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(pushBindingKey) ?? "null",
    ) as PushBinding | null;
    return value &&
      typeof value.owner === "string" &&
      typeof value.receiver_id === "string" &&
      typeof value.key_id === "string" &&
      typeof value.enabled === "boolean"
      ? value
      : null;
  } catch {
    return null;
  }
}
export function decodePushKey(key: string) {
  const bytes = Uint8Array.from(
    atob(key.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new Error(
      "Notification configuration is invalid. Contact the administrator.",
    );
  return bytes;
}
function browserPlatform(): PushPlatform {
  return {
    supported: pushSupported,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    registration: async () => {
      await navigator.serviceWorker.register("/push-sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      let timer: ReturnType<typeof setTimeout>;
      try {
        return await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Notification setup timed out. Retry when you are online.",
                  ),
                ),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer!);
      }
    },
    readBinding: readPushBinding,
    existingRegistration: () => navigator.serviceWorker.getRegistration("/"),
    writeBinding: (binding) =>
      binding
        ? localStorage.setItem(pushBindingKey, JSON.stringify(binding))
        : localStorage.removeItem(pushBindingKey),
    label: () =>
      /android/i.test(navigator.userAgent)
        ? "Android browser"
        : /iphone|ipad/i.test(navigator.userAgent)
          ? "iPhone or iPad browser"
          : "Browser",
  };
}

export class PushClient {
  constructor(
    readonly owner: string,
    private platform: PushPlatform = browserPlatform(),
    private request: PushRequest = apiFetch,
  ) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = operations.then(task, task);
    operations = result.catch(() => {});
    return result;
  }
  private configured(config: PushConfig) {
    return (
      config.enabled &&
      config.test_enabled &&
      config.channel === "web_push" &&
      Boolean(config.public_key && config.key_id)
    );
  }
  enable(config: PushConfig): Promise<PushState> {
    if (!this.platform.supported())
      return Promise.reject(
        new Error("Notifications are not supported by this browser."),
      );
    if (!this.configured(config))
      return Promise.reject(
        new Error("Notifications are not configured on the server yet."),
      );
    try {
      decodePushKey(config.public_key);
    } catch (error) {
      return Promise.reject(error);
    }
    // Keep the permission request in the button's user activation, before any await.
    const epoch = ++intent;
    const permission = this.platform.requestPermission();
    pendingRegistrations++;
    return this.serial(async () => {
      const granted = await permission;
      if (epoch !== intent) return "off";
      if (granted !== "granted") return granted;
      return this.subscribe(config, epoch);
    }).finally(() => {
      pendingRegistrations--;
    });
  }
  reconcile(config: PushConfig): Promise<PushState> {
    pendingRegistrations++;
    return this.serial(async () => {
      const epoch = intent;
      if (!this.platform.supported()) return "unsupported";
      const binding = this.platform.readBinding();
      if (binding && binding.owner !== this.owner) {
        const me = await this.request<{ user: { user_id: string } }>(
          "/api/v1/user/self/me",
        );
        if (me.user.user_id !== this.owner)
          throw new Error(
            "Your account changed. Reload PAX before enabling notifications.",
          );
        const worker = await this.platform.registration();
        await (await worker.pushManager.getSubscription())?.unsubscribe();
        this.platform.writeBinding(null);
        return "off";
      }
      if (
        binding &&
        (!binding.enabled || this.platform.permission() !== "granted")
      ) {
        await this.disableBinding(binding);
        return this.platform.permission() === "denied" ? "denied" : "off";
      }
      if (!this.configured(config)) return "unconfigured";
      if (!binding)
        return this.platform.permission() === "denied" ? "denied" : "off";
      const snapshot = await this.request<{
        regions: {
          receivers?: {
            receiver_id: string;
            user_id: string;
            status: string;
          }[];
        }[];
      }>(
        `${notificationBase}/receivers?search=${encodeURIComponent(binding.receiver_id)}`,
      );
      const receiver = snapshot.regions
        .flatMap((region) => region.receivers ?? [])
        .find((row) => row.receiver_id === binding.receiver_id);
      if (receiver && receiver.user_id !== this.owner)
        throw new Error(
          "Your account changed. Reload PAX before enabling notifications.",
        );
      if (receiver?.status === "revoked" || receiver?.status === "disabled") {
        await this.disableBinding(binding);
        return "off";
      }
      if (
        !receiver ||
        receiver.status === "invalidated" ||
        receiver.status === "expired"
      ) {
        const worker = await this.platform.registration();
        await (await worker.pushManager.getSubscription())?.unsubscribe();
        this.platform.writeBinding(null);
      }
      return this.subscribe(config, epoch);
    }).finally(() => {
      pendingRegistrations--;
    });
  }
  private async subscribe(
    config: PushConfig,
    epoch: number,
  ): Promise<PushState> {
    if (epoch !== intent) return "off";
    const worker = await this.platform.registration();
    const key = decodePushKey(config.public_key);
    let subscription = await worker.pushManager.getSubscription();
    const binding = this.platform.readBinding();
    const currentKey = subscription?.options.applicationServerKey;
    const matches =
      currentKey &&
      new Uint8Array(currentKey).length === key.length &&
      new Uint8Array(currentKey).every((byte, i) => byte === key[i]);
    if (
      subscription &&
      (!binding ||
        binding.owner !== this.owner ||
        binding.key_id !== config.key_id ||
        !matches)
    ) {
      if (binding?.owner === this.owner) await this.revoke(binding.receiver_id);
      await subscription.unsubscribe();
      subscription = null;
      this.platform.writeBinding(null);
    }
    let created = false;
    if (!subscription) {
      subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      created = true;
    }
    if (epoch !== intent) {
      await subscription.unsubscribe().catch(() => false);
      return "off";
    }
    try {
      const data = await this.request<{
        receiver: { receiver_id: string; status: string; user_id: string };
      }>(`${notificationBase}/receivers/web-push`, {
        method: "PUT",
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_label: this.platform.label(),
          permission: "granted",
          enabled: true,
          vapid_key_id: config.key_id,
        }),
      });
      if (!data.receiver.receiver_id || data.receiver.status !== "enabled")
        throw new Error(
          "The server did not enable this notification receiver.",
        );
      if (data.receiver.user_id !== this.owner)
        throw new Error(
          "Your account changed. Reload PAX before enabling notifications.",
        );
      if (epoch !== intent) {
        await Promise.allSettled([
          this.revoke(data.receiver.receiver_id),
          subscription.unsubscribe(),
        ]);
        return "off";
      }
      try {
        this.platform.writeBinding({
          owner: this.owner,
          receiver_id: data.receiver.receiver_id,
          key_id: config.key_id,
          enabled: true,
        });
      } catch (error) {
        await this.revoke(data.receiver.receiver_id).catch(() => {});
        throw error;
      }
      return "enabled";
    } catch (error) {
      if (created) await subscription.unsubscribe().catch(() => false);
      throw error;
    }
  }
  private revoke(id: string) {
    return this.request(
      `${notificationBase}/receivers/${encodeURIComponent(id)}`,
      { method: "DELETE", signal: AbortSignal.timeout(2500) },
    );
  }
  private async disableBinding(binding: PushBinding | null): Promise<"off"> {
    if (binding) this.platform.writeBinding({ ...binding, enabled: false });
    const results = await Promise.allSettled([
      binding ? this.revoke(binding.receiver_id) : Promise.resolve(),
      (this.platform.existingRegistration
        ? this.platform.existingRegistration()
        : this.platform.registration()
      ).then(async (worker) => {
        await (await worker?.pushManager.getSubscription())?.unsubscribe();
      }),
    ]);
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
    this.platform.writeBinding(null);
    return "off";
  }
  disable(): Promise<"off"> {
    intent++;
    const binding = this.platform.readBinding();
    if (
      (binding && binding.owner !== this.owner) ||
      (!binding && pendingRegistrations === 0)
    )
      return Promise.resolve("off");
    // Start local unsubscribe and revocation before waiting for an in-flight request.
    const cleanup = this.disableBinding(binding);
    void cleanup.catch(() => {});
    return this.serial(() => cleanup);
  }
  test() {
    return this.serial(async () => {
      const binding = this.platform.readBinding();
      if (!binding || binding.owner !== this.owner || !binding.enabled)
        throw new Error("Enable notifications on this device first.");
      return this.request(
        `${notificationBase}/receivers/${encodeURIComponent(binding.receiver_id)}/test`,
        { method: "POST" },
      );
    });
  }
}
