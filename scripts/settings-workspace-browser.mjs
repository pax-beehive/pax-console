import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Fictional account and API responses; all navigation and layout use the real app.
const origin = process.env.PAX_SETTINGS_PREVIEW_URL ?? "http://127.0.0.1:3375";
const output =
  process.env.PAX_SETTINGS_SCREENSHOTS ?? "/tmp/pax-settings-workspace";
const publicKey = createECDH("prime256v1").generateKeys().toString("base64url");
// [sidebar label, route, page heading, screenshot name]
const sections = [
  ["My devices", "/settings/devices", "Devices"],
  ["Agent sign-in & usage", "/settings/agent-sign-in", "Agent sign-in & usage"],
  ["Projects", "/settings/projects", "Projects", "projects"],
  ["Secretary", "/settings/secretary", "Secretary"],
  ["Encrypted chats", "/settings/advanced/encryption", "Encrypted chats"],
  ["Language & region", "/settings/language", "Language & region", "language"],
  ["Notifications", "/settings/notifications", "Notifications"],
  ["Voice input", "/settings/voice", "Voice input"],
  ["API keys", "/settings/advanced/api-keys", "API keys", "api-keys"],
  [
    "Manual device registration",
    "/settings/advanced/node-registration",
    "Manual device registration",
  ],
];
// These two open from the Advanced settings directory on narrow screens.
const advancedRoutes = new Set([
  "/settings/advanced/api-keys",
  "/settings/advanced/node-registration",
]);

async function openSettings(browser, viewport, account = {}) {
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
      nodes: account.nodes ?? [],
      agents: [],
      projects: [],
      api_keys: [],
      grants: account.grants ?? [],
      approvals: [],
      sessions: [],
      status: "ok",
    };
    if (path.endsWith("/me"))
      data = {
        user: {
          user_id: "settings-demo",
          email: "alex@example.invalid",
          role: account.role ?? "user",
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
    else if (path.endsWith("/secretary/guidance"))
      data = { scope: "user", revision: 0, instruction: "" };
    else if (path.endsWith("/secretary/tasks")) data = { items: [] };
    else if (path.endsWith("/secretary"))
      data = {
        enabled: false,
        revision: 0,
        state: "disabled",
        pending_count: 0,
        agent_available: false,
      };
    else if (path.endsWith("/secretary/progress"))
      data = {
        as_of: "2026-10-31T12:00:00Z",
        counts: {
          total_sessions: 0,
          completed_sessions: 0,
          partial_sessions: 0,
          unstarted_sessions: 0,
          total_messages: 0,
          completed_messages: 0,
          pending_messages: 0,
          total_turns: 0,
          completed_turns: 0,
          pending_turns: 0,
          ungrouped_messages: 0,
        },
        sessions: [],
      };
    return route.fulfill({ json: { code: 200, data } });
  });
  await page.goto(origin + "/settings");
  await overviewHeading(page).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  return { context, page, errors };
}

const overviewHeading = (page) =>
  page.getByRole("heading", { level: 1, name: "Settings", exact: true });
const sidebar = (page) =>
  page.getByRole("navigation", { name: "Settings", exact: true });
// Links in the page content, excluding the settings sidebar and tab bar.
const content = (page, selector) =>
  page.locator(`main > section ${selector}:visible`);
const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const mobile = viewport.width < 1024;
    const size = mobile ? "mobile" : "desktop";
    const { context, page, errors } = await openSettings(browser, viewport);
    const navigation = sidebar(page);

    // The overview is the same directory on both sizes; the advanced tools
    // stay behind their directory (narrow) or in the sidebar (wide).
    for (const [label, href] of sections)
      assert.equal(
        (await content(page, `a[href="${href}"]`).count()) > 0,
        !advancedRoutes.has(href),
        `${size} overview: ${label}`,
      );
    for (const hidden of ["Service status", "Allowed actions"])
      assert.equal(
        await page.getByRole("link", { name: hidden }).count(),
        0,
        `${size}: ${hidden} must stay hidden for this account`,
      );
    assert.equal(await noOverflow(page), true, `${size} overview overflow`);
    if (mobile) {
      assert.equal(await navigation.isVisible(), false);
      await page.getByRole("link", { name: /^Advanced settings/ }).waitFor();
      await page.getByRole("link", { name: /^Contact us/ }).waitFor();
    } else {
      // Overview plus one link per section.
      assert.equal(
        await navigation.getByRole("link").count(),
        sections.length + 1,
      );
      assert.equal(
        await navigation
          .getByRole("link", { name: "Overview", exact: true })
          .getAttribute("aria-current"),
        "page",
      );
      const bounds = await navigation.boundingBox();
      assert(bounds.width >= 250 && bounds.x === 0);
      await page
        .locator("aside")
        .getByRole("link", { name: "Contact us", exact: true })
        .waitFor();
    }
    await page.screenshot({ path: `${output}/${size}-overview.png` });

    // The account menu names the account, holds the language choice, and
    // reaches settings and support; the top bar has no language control.
    assert.equal(await page.locator("header").getByRole("combobox").count(), 0);
    await page.getByRole("button", { name: "User menu", exact: true }).click();
    const menu = page.getByRole("menu");
    await menu.getByText("alex@example.invalid", { exact: true }).waitFor();
    assert.equal(
      await menu
        .getByRole("menuitemradio", { name: "English", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    await menu.getByRole("menuitemradio", { name: "简体中文" }).waitFor();
    assert.equal(
      await menu
        .getByRole("menuitem", { name: "Settings", exact: true })
        .getAttribute("href"),
      "/settings",
    );
    await menu.getByRole("menuitem", { name: "Contact us" }).waitFor();
    await menu.getByRole("menuitem", { name: "Sign out" }).waitFor();
    await page.screenshot({ path: `${output}/${size}-account-menu.png` });
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });

    for (const [label, href, heading, shot] of sections) {
      const advanced = advancedRoutes.has(href);
      if (mobile) {
        if (advanced) {
          await page.getByRole("link", { name: /^Advanced settings/ }).click();
          await page.waitForURL(origin + "/settings/advanced");
        }
        await content(page, `a[href="${href}"]`).click();
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
      assert.equal(await noOverflow(page), true, href);
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
        await page.screenshot({ path: `${output}/${size}-notifications.png` });
      }
      if (shot)
        await page.screenshot({ path: `${output}/${size}-${shot}.png` });
      if (mobile) {
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
        await overviewHeading(page).waitFor();
      }
    }

    // The advanced directory lists only its own two tools on every size.
    await page.goto(origin + "/settings/advanced");
    await page
      .getByRole("heading", {
        level: 1,
        name: "Advanced settings",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await content(page, 'a[href^="/settings/advanced/"]').count(),
      advancedRoutes.size,
    );
    if (mobile)
      await page.screenshot({ path: `${output}/mobile-advanced-settings.png` });

    // The sidebar appears at the lg boundary; the overview stays the landing page.
    await page.goto(origin + "/settings");
    await page.setViewportSize({
      width: mobile ? 1024 : 1023,
      height: viewport.height,
    });
    await overviewHeading(page).waitFor();
    assert.equal(await navigation.isVisible(), mobile);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // An administrator with a standing permission and a connected device.
  const { context, page, errors } = await openSettings(
    browser,
    { width: 1440, height: 1000 },
    {
      role: "admin",
      grants: [{ approval_id: "grant-demo", title: "Run project tests" }],
      nodes: [
        { node_id: "node-laptop", name: "Laptop", online: true },
        { node_id: "node-server", name: "Server", online: false },
      ],
    },
  );
  const navigation = sidebar(page);
  await content(page, 'a[href="/settings/devices"]')
    .getByText("1 online", { exact: true })
    .waitFor();
  await page.screenshot({ path: `${output}/desktop-administrator.png` });
  for (const [label, href] of [
    ["Allowed actions", "/settings/advanced/permissions"],
    ["Service status", "/settings/service-status"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: false }).click();
    await page.waitForURL(origin + href);
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    assert.equal(
      await navigation
        .getByRole("link", { name: label, exact: false })
        .getAttribute("aria-current"),
      "page",
    );
  }
  assert.deepEqual(errors, []);
  await context.close();

  console.log(
    JSON.stringify({
      result: "passed",
      sections: sections.length,
      desktopAndMobile: true,
      overviewOnEverySize: true,
      accountMenu: true,
      mobileDirectoryAndBackNavigation: true,
      administratorAndPermissionEntries: true,
      noHorizontalOverflow: true,
      fixtures: true,
      screenshots: output,
    }),
  );
} finally {
  await browser.close();
}
