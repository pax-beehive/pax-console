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
      .getByRole("heading", {
        name: mobile ? "Settings" : "Notifications",
        exact: true,
      })
      .waitFor();
    if (!mobile)
      await page
        .getByText("Notifications are off on this device.", { exact: true })
        .waitFor();
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    const navigation = page.getByRole("navigation", {
      name: "Settings",
      exact: true,
    });
    if (mobile) {
      assert.equal(await navigation.isVisible(), false);
      assert.equal(
        await page.getByRole("combobox", { name: "Settings section" }).count(),
        0,
      );
      await page.screenshot({
        path: `${output}/mobile-settings.png`,
        fullPage: false,
      });
    } else {
      assert.equal(await navigation.getByRole("link").count(), 8);
      const bounds = await navigation.boundingBox();
      assert(bounds.width >= 250 && bounds.x === 0);
    }
    for (const [label, href, heading] of sections) {
      if (mobile) {
        if (href.startsWith("/settings/advanced/")) {
          await page.getByRole("link", { name: /^Advanced settings/ }).click();
          await page
            .getByRole("heading", { name: "Advanced settings", exact: true })
            .waitFor();
        }
        await page.locator(`a[href="${href}"]:visible`).click();
      } else
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
      if (mobile) {
        await page.waitForFunction(() => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          const box = nav?.getBoundingClientRect();
          return (
            box && box.height >= 64 && Math.abs(box.bottom - innerHeight) < 1
          );
        });
      }
      if (label === "Notifications") {
        if (mobile)
          await page
            .getByText(/Get notified when a session needs your approval/)
            .waitFor();
        else
          await page
            .getByRole("heading", { name: "Approval requests", exact: true })
            .waitFor();
        await page.screenshot({
          path: `${output}/${mobile ? "mobile" : "desktop"}-notifications.png`,
          fullPage: false,
        });
      }
      if (label === "API keys" || label === "Projects")
        await page.screenshot({
          path: `${output}/${mobile ? "mobile" : "desktop"}-${label === "API keys" ? "api-keys" : "projects"}.png`,
          fullPage: false,
        });
      if (mobile) {
        const advanced = href.startsWith("/settings/advanced/");
        await page
          .getByRole("link", {
            name: advanced ? "Advanced settings" : "Settings",
            exact: true,
          })
          .first()
          .click();
        if (advanced) {
          await page.waitForURL(origin + "/settings/advanced");
          await page
            .getByRole("link", { name: "Settings", exact: true })
            .first()
            .click();
        }
        await page.waitForURL(origin + "/settings");
        await page
          .getByRole("heading", { name: "Settings", exact: true })
          .waitFor();
      }
    }
    await page.goto(origin + "/settings/advanced");
    await page
      .getByRole("heading", {
        name: mobile ? "Advanced settings" : "Allowed actions",
        exact: true,
      })
      .waitFor();
    if (mobile) {
      assert.equal(
        await page.locator('a[href^="/settings/advanced/"]:visible').count(),
        4,
      );
      await page.screenshot({
        path: `${output}/mobile-advanced-settings.png`,
        fullPage: false,
      });
    }
    // Verify the JS landing view and CSS navigation use the same lg boundary.
    await page.goto(origin + "/settings");
    await page.setViewportSize({
      width: mobile ? 1024 : 1023,
      height: viewport.height,
    });
    await page
      .getByRole("heading", {
        name: mobile ? "Notifications" : "Settings",
        exact: true,
      })
      .waitFor();
    assert.equal(await navigation.isVisible(), mobile);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    JSON.stringify({
      result: "passed",
      sections: sections.length,
      desktopAndMobile: true,
      mobileDirectoryAndBackNavigation: true,
      noHorizontalOverflow: true,
      fixtures: true,
      screenshots: output,
    }),
  );
} finally {
  await browser.close();
}
