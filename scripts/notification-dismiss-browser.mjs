import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Fictional account/history and OS notification display. Real React, visibility
// observation, service-worker messaging and IndexedDB run in Chromium.
const origin = process.env.PAX_PUSH_PREVIEW_URL ?? "http://127.0.0.1:3356";
const id = (session, turn) =>
  "ntf_" +
  createHash("sha256")
    .update(JSON.stringify(["user", "agent", session, turn]))
    .digest("hex");
const old = id("read-fixture", "read-turn");
const newer = id("read-fixture", "newer-turn");
const other = id("another-session", "other-turn");
const manual = "ntf_" + "f".repeat(64);
const session = {
  session_id: "read-fixture",
  agent_id: "agent",
  node_id: "node",
  name: "Fictional read session",
  runtime_status: "idle",
  latest_turn_id: "read-turn",
  transport: "manager",
};
const text =
  Array.from({ length: 60 }, (_, i) => `Fictional reply paragraph ${i}.`).join(
    "\n\n",
  ) + "\n\nFinal reply end.";
const history = [
  {
    message_id: "reply",
    session_id: session.session_id,
    turn_id: "read-turn",
    role: "assistant",
    message_type: "agent_message_chunk",
    raw_json: { text_layout: "segment" },
    session_seq: 1,
    parts: [{ part_index: 0, part_type: "text", text }],
  },
  {
    message_id: "done",
    session_id: session.session_id,
    turn_id: "read-turn",
    message_type: "turn_done",
    session_seq: 2,
    parts: [],
  },
];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["notifications"],
  });
  await context.addInitScript(() => {
    window.__auditFocused = false;
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => window.__auditFocused,
    });
  });
  let releaseHistory;
  const historyGate = new Promise((resolve) => {
    releaseHistory = resolve;
  });
  const errors = [];
  const unhandled = [];
  await context.route("**/api/region-config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await context.route("**/api/pax/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ json: { code: 200, data } });
    if (path.endsWith("/me"))
      return ok({
        user: {
          user_id: "user",
          email: "fixture@example.invalid",
          role: "user",
        },
      });
    if (path.endsWith("/customer-visit")) return ok({ recorded: true });
    if (path.endsWith("/notifications/config")) return ok({ enabled: false });
    if (path.endsWith("/history")) {
      await historyGate;
      return ok({
        messages: history,
        pagination: { has_older: false, has_newer: false },
      });
    }
    if (path.endsWith("/events"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: ": fictional idle session\n\n",
      });
    if (path.endsWith("/nodes"))
      return ok({
        nodes: [{ node_id: "node", name: "Fictional node", online: true }],
      });
    if (path.endsWith("/agents"))
      return ok({
        agents: [
          {
            node_id: "node",
            agent_id: "agent",
            name: "Fictional agent",
            online: true,
          },
        ],
      });
    if (path.endsWith("/sessions")) return ok({ sessions: [session] });
    if (path.endsWith("/sessions/read-fixture")) return ok(session);
    if (path.endsWith("/projects")) return ok({ projects: [] });
    if (path.endsWith("/artifacts")) return ok({ artifacts: [] });
    if (path.endsWith("/approvals") || path.endsWith("/approval-grants"))
      return ok({ approvals: [], grants: [] });
    if (path.endsWith("/permission-catalog")) return ok({ choices: [] });
    if (path.endsWith("/configuration")) return ok({ options: [] });
    if (path.endsWith("/turn/queue")) return ok(null);
    if (path.endsWith("/envelopes")) return ok({ envelopes: [] });
    if (path.endsWith("/team-invites")) return ok({ invites: [] });
    if (path.endsWith("/daemon/browser")) return ok({ approvals: [] });
    if (path.endsWith("/notifications/receivers")) return ok({ regions: [] });
    if (path.endsWith("/browser-approvals")) return ok({ approvals: [] });
    unhandled.push(path);
    return ok({});
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/settings/notifications");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/push-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => {
    self.__notifications = [];
    self.__closed = [];
    self.registration.showNotification = async (title, options) => {
      self.__notifications = self.__notifications.filter(
        (n) => n.tag !== options.tag,
      );
      self.__notifications.push({
        title,
        ...options,
        close() {
          self.__closed.push(this.tag);
          self.__notifications = self.__notifications.filter((n) => n !== this);
        },
      });
    };
    self.registration.getNotifications = async () => self.__notifications;
  });
  const push = (notificationId, type = "turn.completed") =>
    worker.evaluate(
      async ({ notificationId, type }) => {
        const event = new Event("push");
        let pending;
        event.data = {
          json: () => ({
            version: 1,
            type,
            notification_id: notificationId,
            url: "/?session_id=read-fixture",
            body: "Fictional reply preview",
          }),
        };
        event.waitUntil = (work) => {
          pending = work;
        };
        self.dispatchEvent(event);
        await pending;
      },
      { notificationId, type },
    );
  const tags = () =>
    worker.evaluate(() => self.__notifications.map((n) => n.tag));
  for (const tag of [old, newer, other]) await push(tag);
  await push(manual, "notification.test");
  await page.goto(origin + "/?session_id=read-fixture");
  await page.waitForFunction(() =>
    document.querySelector("[data-viewport-scroll]"),
  );
  assert(
    (await tags()).includes(old),
    "loading history must not dismiss an alert",
  );
  releaseHistory();
  const marker = page.locator("[data-notification-read-turn='read-turn']");
  await marker
    .waitFor({ state: "attached", timeout: 5000 })
    .catch(async (error) => {
      console.error(
        JSON.stringify({
          errors,
          unhandled,
          url: page.url(),
          body: (await page.locator("body").innerText()).slice(-5000),
        }),
      );
      throw error;
    });
  assert(
    (await tags()).includes(old),
    "an unfocused page must not acknowledge the reply",
  );
  await marker.evaluate((element) => {
    const root = element.closest("[data-viewport-scroll]");
    root.scrollTop = 0;
  });
  await page.waitForFunction(() => {
    const marker = document.querySelector("[data-notification-read-turn]");
    return (
      marker.getBoundingClientRect().top >
      marker.closest("[data-viewport-scroll]").getBoundingClientRect().bottom
    );
  });
  await page.evaluate(() => {
    window.__auditFocused = true;
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(200);
  assert(
    (await tags()).includes(old),
    "reply end outside the viewport must remain unread",
  );
  await marker.evaluate((element) => {
    const root = element.closest("[data-viewport-scroll]");
    root.scrollTop = root.scrollHeight;
  });
  for (let i = 0; i < 100 && (await tags()).includes(old); i++)
    await page.waitForTimeout(25);
  assert.deepEqual((await tags()).sort(), [newer, other, manual].sort());
  await page.goto("about:blank");
  await push(old);
  assert.deepEqual(
    (await tags()).sort(),
    [newer, other, manual].sort(),
    "a late push for a read turn must close without affecting unread alerts",
  );
  const receipts = await worker.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pax-read-notifications", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction("turns")
          .objectStore("turns")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  assert(receipts.some((record) => record.id === old));
  assert(
    receipts.every(
      (record) => Object.keys(record).sort().join() === "id,readAt",
    ),
  );
  assert.deepEqual(errors, [], JSON.stringify({ errors, unhandled }));
  assert.deepEqual(unhandled, []);
  console.log(
    JSON.stringify({
      result: "passed",
      actualWorkbench: true,
      loadingAndUnfocusedAndOffscreenPreserved: true,
      exactTurnDismissed: true,
      newerAndOtherAndTestPreserved: true,
      latePushDismissed: true,
      realIndexedDB: true,
      nativeDisplayTested: false,
      fixtures: true,
      unhandled,
    }),
  );
} finally {
  await browser.close();
}
