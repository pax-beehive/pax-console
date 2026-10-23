import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let analyticsRequests = 0,
    visitRequests = 0;
  const now = new Date().toISOString();
  const customer = (email, extra = {}) => ({
    user_id: email,
    email,
    is_admin: false,
    created_at: now,
    first_visit_at: null,
    last_visit_at: null,
    devices: 0,
    agents: 0,
    first_bound_at: null,
    user_messages: 0,
    first_message_at: null,
    last_message_at: null,
    encrypted_records: 0,
    sessions: 0,
    ...extra,
  });
  await page.route("**/api/region-config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/pax/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/me"))
      return route.fulfill({
        json: {
          code: 200,
          data: {
            user: {
              user_id: "usr_demo",
              email: "admin@example.invalid",
              is_admin: true,
              role: "admin",
            },
          },
        },
      });
    if (path.endsWith("/customer-visit")) {
      visitRequests++;
      return route.fulfill({ json: { code: 200, data: { recorded: true } } });
    }
    if (path.endsWith("/customer-analytics")) {
      analyticsRequests++;
      return route.fulfill({
        json: {
          code: 200,
          data: {
            regions: [
              {
                region: "us",
                available: true,
                updated_at: now,
                users: [
                  customer("admin@example.invalid", {
                    is_admin: true,
                    agents: 2,
                    devices: 1,
                    user_messages: 8,
                  }),
                  customer("alex@example.invalid", {
                    agents: 1,
                    devices: 1,
                    user_messages: 3,
                    first_visit_at: now,
                    last_visit_at: now,
                  }),
                ],
              },
              {
                region: "hk",
                available: true,
                updated_at: now,
                users: [customer("sam@example.invalid")],
              },
            ],
          },
        },
      });
    }
    return route.fulfill({ status: 404, json: { code: 404 } });
  });
  await page.goto(
    (process.env.PAX_ANALYTICS_PREVIEW_URL ?? "http://127.0.0.1:3349") +
      "/admin/customers",
  );
  await page.getByText("alex@example.invalid", { exact: true }).waitFor();
  assert.equal(analyticsRequests, 1);
  await page.getByLabel("Audience").selectOption("all");
  await page.getByLabel("Stage").selectOption("sent");
  assert.equal(
    await page.getByText("sam@example.invalid", { exact: true }).count(),
    0,
  );
  await page.getByText("alex@example.invalid", { exact: true }).click();
  await page.getByRole("region", { name: "Customer details" }).waitFor();
  assert.equal(
    analyticsRequests,
    1,
    "filters and details must not make requests",
  );
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event("blur"));
  });
  const paused = { analyticsRequests, visitRequests };
  await page.clock.runFor(120_000);
  assert.deepEqual(
    { analyticsRequests, visitRequests },
    paused,
    "no polling while unfocused",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    window.dispatchEvent(new Event("focus"));
  });
  await page.clock.runFor(1);
  await page.waitForFunction(() =>
    document.body.textContent.includes("Live · 15s"),
  );
  await page.waitForTimeout(10);
  assert.equal(
    analyticsRequests,
    paused.analyticsRequests + 1,
    "focus makes one request, not a burst",
  );
  await page.getByLabel("Stage").selectOption("all");
  await mkdir("/tmp/pax-customer-audit", { recursive: true });
  await page.screenshot({
    path: "/tmp/pax-customer-audit/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/pax-customer-audit/dashboard-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "no document overflow on mobile",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      verified: [
        "admin screen",
        "local filters",
        "user details",
        "120s without focus: zero requests",
        "focus: one refresh",
        "mobile layout",
      ],
      analyticsRequests,
      visitRequests,
    }),
  );
} finally {
  await browser.close();
}
