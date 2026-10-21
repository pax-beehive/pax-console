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
          ? "Your turn has finished."
          : "You have a new notification.",
      icon: "/pax-app-icon.png",
      badge: "/pax-app-icon.png",
      tag,
      renotify: false,
      data: { url: notificationTarget(payload.url) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (window) => new URL(window.url).origin === self.location.origin,
      );
      if (client) {
        await client.navigate(target);
        await client.focus();
      } else await self.clients.openWindow(target);
    })(),
  );
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
