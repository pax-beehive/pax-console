import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Fictional account and API responses; all navigation and layout use the real app.
const origin = process.env.PAX_SETTINGS_PREVIEW_URL ?? "http://127.0.0.1:3375";
const output =
  process.env.PAX_SETTINGS_SCREENSHOTS ?? "/tmp/pax-settings-workspace";
const publicKey = createECDH("prime256v1").generateKeys().toString("base64url");
const sections = [
  ["Notifications", "/settings/notifications", "Notifications"],
  ["Devices & agents", "/settings/devices", "Devices"],
  ["Projects", "/settings/projects", "Projects"],
  ["Allowed actions", "/settings/advanced/permissions", "Allowed actions"],
  ["Encrypted chats", "/settings/advanced/encryption", "Encrypted chats"],
  ["API keys", "/settings/advanced/api-keys", "API keys"],
  [
    "Device registration",
    "/settings/advanced/node-registration",
    "Manual device registration",
  ],
  ["Service status", "/settings/service-status", "Service status"],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const mobile = viewport.width < 1024;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => "default",
      });
      Notification.requestPermission = async () => {
        throw new Error("Navigation must not prompt for permission");
      };
    });
    await page.route("**/api/region-config", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/pax/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {
        nodes: [],
        agents: [],
        projects: [],
        api_keys: [],
        grants: [],
        approvals: [],
        sessions: [],
        status: "ok",
      };
      if (path.endsWith("/me"))
        data = {
          user: {
            user_id: "settings-demo",
            email: "alex@example.invalid",
            role: "user",
          },
        };
      else if (path.endsWith("/notifications/config"))
        data = {
          enabled: true,
          test_enabled: true,
          turn_completion_enabled: true,
          approval_required_enabled: true,
          public_key: publicKey,
          key_id: "fixture",
          channel: "web_push",
        };
      else if (path.endsWith("/receivers"))
        data = {
          regions: [{ region: "local", available: true, receivers: [] }],
        };
      return route.fulfill({ json: { code: 200, data } });
    });
    await page.goto(origin + "/settings");
    await page
      .getByRole("heading", { name: "Notifications", exact: true })
      .waitFor();
    await page
      .getByText("Notifications are off on this device.", { exact: true })
      .waitFor();
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    const navigation = page.getByRole("navigation", {
      name: "Settings",
      exact: true,
    });
    if (mobile) await assert.equal(await navigation.isVisible(), false);
    else {
      assert.equal(await navigation.getByRole("link").count(), 8);
      const bounds = await navigation.boundingBox();
      assert(bounds.width >= 250 && bounds.x === 0);
    }
    for (const [label, href, heading] of sections) {
      if (mobile)
        await page
          .getByRole("combobox", { name: "Settings section" })
          .selectOption(href);
      else
        await navigation
          .getByRole("link", { name: label, exact: false })
          .click();
      await page.waitForURL(origin + href);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      if (!mobile)
        assert.equal(
          await navigation
            .getByRole("link", { name: label, exact: false })
            .getAttribute("aria-current"),
          "page",
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        href,
      );
      if (label === "Notifications") {
        await page
          .getByRole("heading", { name: "Approval requests", exact: true })
          .waitFor();
        await page.screenshot({
          path: `${output}/${mobile ? "mobile" : "desktop"}-notifications.png`,
          fullPage: true,
        });
      }
      if (label === "API keys" || label === "Projects")
        await page.screenshot({
          path: `${output}/${mobile ? "mobile" : "desktop"}-${label === "API keys" ? "api-keys" : "projects"}.png`,
          fullPage: true,
        });
    }
    await page.goto(origin + "/settings/advanced");
    await page.waitForURL(origin + "/settings/advanced/permissions");
    await page
      .getByRole("heading", { name: "Allowed actions", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    JSON.stringify({
      result: "passed",
      sections: sections.length,
      desktopAndMobile: true,
      legacyAdvancedRedirect: true,
      noHorizontalOverflow: true,
      fixtures: true,
      screenshots: output,
    }),
  );
} finally {
  await browser.close();
}
