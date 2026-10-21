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
    if (url.origin !== self.location.origin) return "/settings/notifications";
    if (url.pathname === "/settings/notifications")
      return "/settings/notifications";
    let sessionId;
    if (
      url.pathname === "/" &&
      url.searchParams.getAll("session_id").length === 1
    )
      sessionId = url.searchParams.get("session_id");
    else if (/^\/sessions\/[^/]+$/.test(url.pathname))
      sessionId = decodeURIComponent(url.pathname.slice("/sessions/".length));
    if (
      !sessionId ||
      sessionId.length > 512 ||
      sessionId.trim() !== sessionId ||
      /[\x00-\x1f\x7f]/.test(sessionId)
    )
      return "/settings/notifications";
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("session_id", sessionId);
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
function notificationId(value) {
  return typeof value === "string" && /^ntf_[a-f0-9]{64}$/.test(value);
}
// Local read receipts contain opaque notification IDs only. Manager alerts expire
// after one hour; retain at most 512 receipts for 24 hours to cover late delivery.
async function readNotificationIds(ids = []) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("pax-read-notifications", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("turns", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Read receipt store blocked"));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("turns", "readwrite");
      const store = transaction.objectStore("turns");
      const request = store.getAll();
      let kept = new Set();
      request.onsuccess = () => {
        const now = Date.now();
        const records = new Map(
          request.result
            .filter(
              (record) =>
                notificationId(record.id) &&
                Number.isFinite(record.readAt) &&
                record.readAt > now - 24 * 3600_000 &&
                record.readAt <= now,
            )
            .map((record) => [record.id, record]),
        );
        for (const id of ids) records.set(id, { id, readAt: now });
        const bounded = [...records.values()]
          .sort((a, b) => b.readAt - a.readAt)
          .slice(0, 512);
        kept = new Set(bounded.map((record) => record.id));
        for (const record of request.result)
          if (!kept.has(record.id)) store.delete(record.id);
        for (const record of bounded)
          if (ids.includes(record.id)) store.put(record);
      };
      transaction.oncomplete = () => resolve(kept);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
async function closeReadNotifications(ids) {
  const notifications = await self.registration.getNotifications();
  for (const notification of notifications)
    if (ids.has(notification.tag)) notification.close();
}
self.addEventListener("message", (event) => {
  const ids = event.data?.ids;
  if (
    event.data?.type !== "pax:read-turn-notifications" ||
    !appWindow(event.source) ||
    !Array.isArray(ids) ||
    ids.length > 512
  )
    return;
  const valid = new Set(ids.filter(notificationId));
  if (!valid.size) return;
  event.waitUntil(
    (async () => {
      try {
        await readNotificationIds([...valid]);
      } catch {
        // Unavailable local storage must not prevent closing the displayed alert.
      }
      await closeReadNotifications(valid).catch(() => {});
    })(),
  );
});
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
      // Client.url is the document creation URL; Home may have switched sessions.
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
  const tag = notificationId(payload.notification_id)
    ? payload.notification_id
    : undefined;
  event.waitUntil(
    self.registration
      .showNotification("Pax Workspace", {
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
      })
      .then(async () => {
        // Always show first (userVisibleOnly), then dismiss an exact already-read
        // turn. Recheck after show resolves so a concurrent read cannot miss it.
        if (payload.type !== "turn.completed" || !tag) return;
        try {
          const read = await readNotificationIds();
          if (read.has(tag)) await closeReadNotifications(new Set([tag]));
        } catch {
          // Fail open: storage/API failures leave the notification visible.
        }
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
