import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";

// Fictional API, permission and subscription fixtures. The installed worker runs in Chromium; native OS display is not claimed.
const origin = process.env.PAX_PUSH_PREVIEW_URL ?? "http://127.0.0.1:3355";
const key = createECDH("prime256v1").generateKeys().toString("base64url");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["notifications"],
  });
  await context.grantPermissions(["notifications"], { origin });
  let registered = false;
  let tests = 0;
  let revoked = 0;
  let confirmationGate = null;
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((appOrigin) => {
    if (location.origin !== appOrigin) return;
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    window.__pushAudit = {
      permissionCalls: 0,
      subscriptions: 0,
      unsubscriptions: 0,
    };
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "granted",
    });
    Notification.requestPermission = async () => {
      window.__pushAudit.permissionCalls++;
      return "granted";
    };
    const subscriptionFixture = (options) => ({
      options,
      unsubscribe: async () => {
        subscription = null;
        localStorage.removeItem("audit:push-subscription");
        window.__pushAudit.unsubscriptions++;
        return true;
      },
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/wp/fictional-browser-test",
        expirationTime: null,
        keys: { auth: "fictional-auth", p256dh: "fictional-public-key" },
      }),
    });
    // A browser subscription survives document navigation; the display fixture
    // must do the same while exercising repeated notification clicks/reloads.
    const storedKey = localStorage.getItem("audit:push-subscription");
    let subscription = storedKey
      ? subscriptionFixture({
          applicationServerKey: new Uint8Array(JSON.parse(storedKey)),
        })
      : null;
    PushManager.prototype.getSubscription = async () => subscription;
    PushManager.prototype.subscribe = async function (options) {
      window.__pushAudit.subscriptions++;
      localStorage.setItem(
        "audit:push-subscription",
        JSON.stringify([...new Uint8Array(options.applicationServerKey)]),
      );
      subscription = subscriptionFixture(options);
      return subscription;
    };
  }, origin);
  await page.route("**/api/region-config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/pax/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const ok = (data, status = 200) =>
      route.fulfill({ status, json: { code: status, data } });
    if (
      url.pathname.endsWith("/receivers") &&
      url.searchParams.has("search") &&
      confirmationGate
    )
      await confirmationGate;
    const receiver = {
      receiver_id: "nrecv_fictional",
      user_id: "user",
      status: registered ? "enabled" : "revoked",
      latest_delivery: tests
        ? {
            status: "pending",
            attempts: 0,
            attempted_at: "0001-01-01T00:00:00Z",
          }
        : null,
    };
    if (url.pathname.endsWith("/me"))
      return ok({
        user: {
          user_id: "user",
          email: "mobile@example.invalid",
          role: "user",
        },
      });
    if (url.pathname.endsWith("/customer-visit")) return ok({ recorded: true });
    if (url.pathname.endsWith("/nodes")) return ok({ nodes: [] });
    if (url.pathname.endsWith("/agents")) return ok({ agents: [] });
    if (url.pathname.endsWith("/notifications/config"))
      return ok({
        enabled: true,
        test_enabled: true,
        turn_completion_enabled: true,
        public_key: key,
        key_id: "audit",
        channel: "web_push",
      });
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      assert.equal(body.permission, "granted");
      assert.equal(body.vapid_key_id, "audit");
      registered = true;
      return ok({ receiver: { ...receiver, status: "enabled" } });
    }
    if (url.pathname.endsWith("/test")) {
      assert.equal(registered, true);
      tests++;
      return ok({ delivery: { status: "pending" } }, 202);
    }
    if (request.method() === "DELETE") {
      registered = false;
      revoked++;
      return ok({ revoked: true });
    }
    if (url.pathname.endsWith("/receivers"))
      return ok({
        regions: [
          {
            region: "us",
            available: true,
            receivers: registered || revoked ? [receiver] : [],
          },
        ],
      });
    return route.fulfill({ status: 404, json: { code: 404 } });
  });
  await page.goto(origin + "/settings/notifications");
  await page
    .getByText(/Automatic notifications are enabled for standard sessions/)
    .waitFor();
  const enable = page.getByRole("button", {
    name: "Enable notifications",
    exact: true,
  });
  await enable.waitFor();
  assert.equal(
    await page.evaluate(() => window.__pushAudit.permissionCalls),
    0,
  );
  await enable.click({ timeout: 15000 }).catch(async (error) => {
    console.log("Enable diagnostics:", await page.locator("body").innerText());
    console.log(
      "Browser capabilities:",
      await page.evaluate(() => ({
        secure: isSecureContext,
        permission: Notification.permission,
        binding: localStorage.getItem("pax:push-binding:v1"),
      })),
    );
    console.log("Page errors:", errors);
    throw error;
  });
  await page
    .getByRole("button", { name: "Send test notification", exact: true })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Settings section" })
    .selectOption("/settings/devices");
  await page.getByRole("heading", { name: "Devices", exact: true }).waitFor();
  let releaseConfirmation;
  confirmationGate = new Promise((resolve) => {
    releaseConfirmation = resolve;
  });
  await page.evaluate(() => {
    window.__enabledActionFlashed = false;
    window.__enableObserver = new MutationObserver(() => {
      for (const button of document.querySelectorAll("button")) {
        if (
          button.textContent.trim() === "Enable notifications" &&
          !button.disabled
        )
          window.__enabledActionFlashed = true;
      }
    });
    window.__enableObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  await page
    .getByRole("combobox", { name: "Settings section" })
    .selectOption("/settings/notifications");
  await page.getByText("Checking notifications...", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Enable notifications", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByText("Notifications are off on this device.", { exact: true })
      .count(),
    0,
  );
  await mkdir("/tmp/pax-webpush-audit", { recursive: true });
  await page.screenshot({
    path: "/tmp/pax-webpush-audit/subscription-checking.png",
    fullPage: true,
  });
  releaseConfirmation();
  confirmationGate = null;
  await page
    .getByText("Notifications are enabled on this device.", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => {
      window.__enableObserver.disconnect();
      return window.__enabledActionFlashed;
    }),
    false,
    "cached settings never expose an enabled Enable action during reconciliation",
  );
  await page
    .getByRole("button", { name: "Send test notification", exact: true })
    .click();
  await page.getByText(/Test notification queued/).waitFor();
  assert.equal(tests, 1);
  assert.equal(
    await page.evaluate(() => window.__pushAudit.permissionCalls),
    1,
  );
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const response = await page.request.get(origin + "/push-sw.js");
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-type"], /javascript/);
  assert.equal(response.headers()["service-worker-allowed"], "/");
  const badge = await page.request.get(origin + "/pax-notification-badge.png");
  assert.equal(badge.status(), 200);
  assert.match(badge.headers()["content-type"], /image\/png/);
  assert.deepEqual(
    await badge.body(),
    await readFile(
      new URL("../public/pax-notification-badge.png", import.meta.url),
    ),
  );
  await mkdir("/tmp/pax-webpush-audit", { recursive: true });
  await page.screenshot({
    path: "/tmp/pax-webpush-audit/settings-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  const registration = await page.evaluate(async () => ({
    scope: (await navigator.serviceWorker.ready).scope,
  }));
  assert.equal(registration.scope, origin + "/");
  await worker.evaluate(() => {
    self.__shownNotifications = [];
    self.registration.showNotification = async (title, options) => {
      self.__shownNotifications.push({
        title,
        body: options.body,
        tag: options.tag,
        badge: options.badge,
        icon: options.icon,
        data: options.data,
      });
    };
  });
  await page.goto("about:blank");
  const notifications = await worker.evaluate(async () => {
    const event = new Event("push");
    let pending;
    event.data = {
      json: () => ({
        version: 1,
        type: "notification.test",
        notification_id: `ntf_${"b".repeat(64)}`,
        url: "/settings/notifications",
      }),
    };
    event.waitUntil = (work) => {
      pending = work;
    };
    self.dispatchEvent(event);
    await pending;
    return self.__shownNotifications;
  });
  assert.deepEqual(notifications, [
    {
      title: "Pax Workspace",
      body: "Notifications are working on this device.",
      tag: `ntf_${"b".repeat(64)}`,
      badge: "/pax-notification-badge.png",
      icon: "/pax-app-icon.png",
      data: { url: "/settings/notifications" },
    },
  ]);

  const sessionPath = "/?session_id=click-fixture";
  await context.route(origin + sessionPath, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fictional session</title><main>Notification navigation fixture</main>",
    }),
  );
  await page.goto(origin + "/settings/notifications");
  const completion = await worker.evaluate(async (url) => {
    const event = new Event("push");
    let pending;
    event.data = {
      json: () => ({
        version: 1,
        type: "turn.completed",
        body: "Final response.\nAll checks passed.",
        url,
      }),
    };
    event.waitUntil = (work) => {
      pending = work;
    };
    self.dispatchEvent(event);
    await pending;
    return self.__shownNotifications.at(-1);
  }, sessionPath);
  assert.equal(completion.body, "Final response. All checks passed.");
  assert.equal(completion.data.url, sessionPath);
  const clickNotification = (data) =>
    worker.evaluate(async (data) => {
      // Synthetic events lack notification user activation. Fixture only OS focus;
      // keep the real WindowClient navigation and observed document URL.
      const originalFocus = WindowClient.prototype.focus;
      WindowClient.prototype.focus = async function () {
        return this;
      };
      const event = new Event("notificationclick");
      let pending;
      event.notification = { data, close() {} };
      event.waitUntil = (work) => {
        pending = work;
      };
      try {
        self.dispatchEvent(event);
        await pending;
      } finally {
        WindowClient.prototype.focus = originalFocus;
      }
    }, data);
  await clickNotification(completion.data);
  await page.waitForURL(origin + sessionPath);
  assert.equal(await page.title(), "Fictional session");

  const otherSessionPath = "/?session_id=another-session";
  await page.evaluate((path) => {
    history.replaceState(history.state, "", path);
    document.querySelector("main").textContent = "Another active session";
  }, otherSessionPath);
  assert.equal(page.url(), origin + otherSessionPath);
  const clientURLs = await worker.evaluate(async () =>
    (await self.clients.matchAll({ type: "window" })).map(
      (client) => client.url,
    ),
  );
  console.log(
    JSON.stringify({
      case: "Home switched after document creation",
      visibleURL: page.url(),
      workerClientURLs: clientURLs,
    }),
  );
  await clickNotification(completion.data);
  assert.equal(
    page.url(),
    origin + sessionPath,
    "notification must navigate back to its session after an in-page session switch",
  );
  assert.equal(
    await page.locator("main").innerText(),
    "Notification navigation fixture",
  );
  await page.goto(origin + "/settings/notifications");
  // Finish foreground reconciliation before the ordinary disable assertion.
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Turn off on this device", exact: true })
    .click();
  await page
    .getByText("Notifications are off on this device.", { exact: true })
    .waitFor();
  assert.equal(registered, false);
  assert.equal(revoked, 1);
  assert.equal(
    await page.evaluate(() => window.__pushAudit.permissionCalls),
    0,
    "reconciliation never re-prompts",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      switchedAwayFromTargetBeforeClick: true,
      tests,
      revoked,
      workerHandledSyntheticPushWithoutAppPage: true,
      syntheticClickNavigatedExistingWindow: true,
      homeSessionTarget: sessionPath,
      cachedStatusWaitedForConfirmation: true,
      replyPreviewVerified: true,
      windowFocusFixture: true,
      nativeNotificationClickTested: false,
      nativeDisplayTested: false,
      screenshot: "/tmp/pax-webpush-audit/settings-mobile.png",
      fixtures: true,
    }),
  );
} finally {
  await browser.close();
}
