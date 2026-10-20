import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Browser QA uses fictional metadata only; production application code has no fixtures.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let requests = 0;
  const now = "2026-10-19T12:00:00Z";
  await page.addInitScript(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
  });
  await page.route("**/api/region-config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/pax/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/me"))
      return route.fulfill({
        json: {
          code: 200,
          data: {
            user: {
              user_id: "admin_demo",
              email: "admin@example.invalid",
              is_admin: true,
              role: "admin",
            },
          },
        },
      });
    if (url.pathname.endsWith("/customer-visit"))
      return route.fulfill({ json: { code: 200, data: { recorded: true } } });
    if (url.pathname.endsWith("/notification-subscriptions")) {
      requests++;
      const state = url.searchParams.get("status");
      const receivers = [
        {
          receiver_id: "nrecv_pixel",
          user_id: "u_alex",
          email: "alex@example.invalid",
          device_label: "Pixel 9 · Chrome",
          channel: "web_push",
          revision: 2,
          status: "enabled",
          permission: "granted",
          permission_reported_at: now,
          created_at: now,
          last_registered_at: now,
          latest_delivery: null,
        },
        {
          receiver_id: "nrecv_desktop",
          user_id: "u_sam",
          email: "sam@example.invalid",
          device_label: "MacBook · Chrome",
          channel: "web_push",
          revision: 3,
          status: "disabled",
          permission: "denied",
          permission_reported_at: now,
          created_at: now,
          last_registered_at: now,
          latest_delivery: null,
        },
      ].filter((row) => !state || row.status === state);
      return route.fulfill({
        json: {
          code: 200,
          data: {
            regions: [
              {
                region: "us",
                available: true,
                updated_at: now,
                receivers,
                summary: {
                  total: receivers.length,
                  enabled: receivers.filter((row) => row.status === "enabled")
                    .length,
                  disabled: receivers.filter((row) => row.status === "disabled")
                    .length,
                  revoked: 0,
                  expired: 0,
                  invalidated: 0,
                  enabled_users: receivers.filter(
                    (row) => row.status === "enabled",
                  ).length,
                },
              },
              { region: "hk", available: false, error: "unavailable" },
            ],
          },
        },
      });
    }
    return route.fulfill({ status: 404, json: { code: 404 } });
  });
  await page.goto(
    (process.env.PAX_SUBSCRIPTIONS_PREVIEW_URL ?? "http://127.0.0.1:3354") +
      "/admin/notifications",
  );
  await page.getByText("alex@example.invalid", { exact: true }).waitFor();
  assert.equal(requests, 1);
  await page
    .getByRole("button", { name: "Details", exact: true })
    .first()
    .click();
  await page.getByRole("region", { name: "Receiver details" }).waitFor();
  assert.equal(requests, 1, "details must use existing metadata");
  await mkdir("/tmp/pax-notification-audit", { recursive: true });
  await page.screenshot({
    path: "/tmp/pax-notification-audit/subscriptions-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/pax-notification-audit/subscriptions-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile page must not overflow",
  );
  await page
    .getByLabel("Subscription status", { exact: true })
    .selectOption("disabled");
  await page
    .getByText("alex@example.invalid", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.getByText("sam@example.invalid", { exact: true }).count(),
    1,
  );
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event("blur"));
  });
  const paused = requests;
  await page.clock.runFor(120_000);
  assert.equal(requests, paused, "unfocused dashboard must not poll");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      requests,
      screenshots: "/tmp/pax-notification-audit",
    }),
  );
} finally {
  await browser.close();
}
