/* This worker handles push only and never caches authenticated requests. */
function notificationTarget(value) {
  try {
    if (
      typeof value !== "string" ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      /[\\\x00-\x20]/.test(value)
    )
      return "/settings/notifications";
    const url = new URL(value, self.location.origin);
    if (
      url.origin !== self.location.origin ||
      (!/^\/sessions\/[^/]+$/.test(url.pathname) &&
        url.pathname !== "/settings/notifications")
    )
      return "/settings/notifications";
    return url.pathname + url.search;
  } catch {
    return "/settings/notifications";
  }
}
function notificationBody(value) {
  if (typeof value !== "string") return "Your turn has finished.";
  const text = value
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Your turn has finished.";
  const characters = Array.from(text);
  return characters.length > 200
    ? characters.slice(0, 199).join("") + "\u2026"
    : text;
}
function appWindow(client) {
  try {
    return (
      client.frameType === "top-level" &&
      new URL(client.url).origin === self.location.origin
    );
  } catch {
    return false;
  }
}
async function openNotificationTarget(path) {
  const target = new URL(path, self.location.origin).href;
  const windows = await self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .catch(() => []);
  const appWindows = windows.filter(appWindow);
  const client =
    appWindows.find((window) => window.url === target) ?? appWindows[0];
  if (client) {
    try {
      // Focus while the notification click still supplies user activation.
      const focused = await client.focus();
      if (client.url === target) return;
      if (await focused.navigate(target)) return;
    } catch {
      /* A closed or non-navigable client must not swallow the click. */
    }
  }
  await self.clients.openWindow(target);
}
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    /* Always display a visible generic notification. */
  }
  if (!payload || typeof payload !== "object" || payload.version !== 1)
    payload = {};
  const test = payload.type === "notification.test";
  const tag =
    typeof payload.notification_id === "string" &&
    /^ntf_[a-f0-9]{64}$/.test(payload.notification_id)
      ? payload.notification_id
      : undefined;
  event.waitUntil(
    self.registration.showNotification("Pax Workspace", {
      body: test
        ? "Notifications are working on this device."
        : payload.type === "turn.completed"
          ? notificationBody(payload.body)
          : "You have a new notification.",
      icon: "/pax-app-icon.png",
      badge: "/pax-notification-badge.png",
      tag,
      renotify: false,
      data: { url: notificationTarget(payload.url) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data?.url);
  event.waitUntil(openNotificationTarget(target));
});
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients)
          client.postMessage({ type: "pax:push-subscription-changed" });
      }),
  );
});
