// Start the Console locally, then run: node scripts/settings-browser-check.cjs
// All PAX API requests are intercepted; this never creates real credentials.
const baseURL = process.env.SETTINGS_CHECK_URL || "http://localhost:3017";
(async () => {
  const { chromium } = await import("playwright");
  const { default: assert } = await import("node:assert/strict");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: "chrome" }),
  });
  const context = await browser.newContext();
  const errors = [];
  const mutations = [];
  await context.route("**/api/pax/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    let data = {};
    if (req.method() !== "GET") mutations.push({ p, body: req.postDataJSON() });
    if (p.endsWith("/me"))
      data = {
        user: { user_id: "u1", display_name: "Test user", role: "user" },
      };
    else if (p.endsWith("/health")) data = { status: "ok" };
    else if (p.endsWith("/node-registration-tokens"))
      data = {
        token: "test-token-not-real",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
    else if (p.endsWith("/nodes"))
      data = {
        nodes: [
          {
            node_id: "n1",
            name: "Office Mac",
            hostname: "office",
            online: true,
            os: "darwin",
            arch: "arm64",
          },
        ],
      };
    else if (p.endsWith("/agents"))
      data = {
        agents: [
          {
            agent_id: "a1",
            node_id: "n1",
            name: "Offline Agent",
            online: false,
          },
        ],
      };
    else if (p.endsWith("/projects")) data = { projects: [] };
    else if (p.endsWith("/sessions")) data = { sessions: [] };
    else if (p.endsWith("/api-keys")) data = { api_keys: [] };
    else if (p.endsWith("/approval-grants")) data = { grants: [] };
    await route.fulfill({ json: { code: 200, data } });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL + "/settings");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    await page.locator('a[href="/settings/advanced"]').last().click();
    await page
      .getByRole("heading", { name: "Advanced settings", exact: true })
      .waitFor();
    for (const [path, title] of [
      ["permissions", "Allowed actions"],
      ["encryption", "Encrypted chats"],
      ["api-keys", "API keys"],
      ["node-registration", "Manual device registration"],
    ]) {
      await page.locator(`a[href="/settings/advanced/${path}"]`).last().click();
      await page
        .getByRole("heading", { name: title, exact: true })
        .first()
        .waitFor();
      await page.goBack();
      await page
        .getByRole("heading", { name: "Advanced settings", exact: true })
        .waitFor();
    }
    await page.goto(baseURL + "/settings/service-status");
    await page.getByText("Offline Agent", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("All systems operational", { exact: true }).count(),
      0,
    );

    await page.goto(baseURL + "/settings/devices/add");
    await page
      .getByRole("button", { name: "Quick connect (Recommended)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Copy command", exact: true })
      .waitFor();
    assert.match(
      await page.locator("pre").innerText(),
      /PAX_REGISTRATION_TOKEN='test-token-not-real'/,
    );
    const installCommand = await page.locator("pre").innerText();
    assert.doesNotMatch(installCommand, /\/api\/v1\/public\/paxl\/install\.sh/);
    assert.match(installCommand, /\/api\/v1\/public\/paxd\/install\.sh/);
    assert.match(installCommand, /PAX_SETUP_AFTER_INSTALL=1/);
    await page
      .getByRole("button", { name: "Browser sign-in", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Copy command", exact: true })
      .waitFor();
    assert.match(
      await page.locator("pre").innerText(),
      /PAX_REGISTRATION_TOKEN=''/,
    );
    assert.match(
      await page.locator("pre").innerText(),
      /\/api\/v1\/public\/paxd\/install\.sh/,
    );
    await page.goto(baseURL + "/settings/projects");
    await page
      .getByRole("heading", { name: "Projects", exact: true })
      .first()
      .waitFor();
    await page.goto(baseURL + "/settings");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();

    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "horizontal overflow",
    );
  }
  for (const [old, dest] of [
    ["security", "advanced"],
    ["developer?view=node-registration", "advanced/node-registration"],
    ["api-keys", "advanced/api-keys"],
    ["diagnostics", "service-status"],
  ]) {
    await page.goto(baseURL + "/settings/" + old);
    await page.waitForURL("**/settings/" + dest);
  }
  assert.deepEqual(
    mutations.map((m) => m.body),
    [{ expires_in_seconds: 3600 }, { expires_in_seconds: 3600 }],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/mobile navigation, advanced pages, status, quick command, pairing, projects, legacy redirects; no browser errors; only fixture token writes.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
