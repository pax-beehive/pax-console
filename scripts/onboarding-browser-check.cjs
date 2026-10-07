// Start Console locally, then run: node scripts/onboarding-browser-check.cjs
// Every PAX API request is intercepted. No real tokens or connections are created.
const baseURL = process.env.ONBOARDING_CHECK_URL || "http://127.0.0.1:3013";
(async () => {
  const { chromium } = await import("playwright");
  const { default: assert } = await import("node:assert/strict");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: "chrome" }),
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
  });
  let nodes = [];
  let available = false;
  let created = false;
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/pax/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let data = {};
    if (path.endsWith("/me"))
      data = {
        user: {
          user_id: "preview",
          name: "Kevin",
          email: "preview@example.test",
        },
      };
    else if (path.endsWith("/node-registration-tokens"))
      data = {
        token: "preview-token-not-valid",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
    else if (path.endsWith("/nodes")) data = { nodes };
    else if (path.endsWith("/harnesses/discover"))
      data = {
        harnesses: {
          items: [
            {
              harness: "codex",
              state: available ? "available" : "missing",
              command: ["codex-acp"],
            },
            {
              harness: "claude-code",
              state: "available",
              command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
            },
          ],
        },
      };
    else if (path.endsWith("/agent-connections") && req.method() === "POST") {
      created = true;
      data = {
        command_id: "cmd",
        connection_id: "connection",
        agent_id: "agent",
        desired_generation: 1,
      };
    } else if (path.includes("/agent-connections"))
      data = {
        agent_connections: {
          items: created
            ? [
                {
                  id: "connection",
                  status: {
                    phase: "running",
                    observed_generation: 1,
                    observed_restart_nonce: 0,
                  },
                },
              ]
            : [],
        },
      };
    else if (path.endsWith("/health")) data = { status: "ok" };
    else if (path.includes("/agents"))
      data = {
        agents: created
          ? [
              {
                agent_id: "agent",
                node_id: "mac",
                name: "Codex",
                online: true,
                agent_type: "codex",
              },
            ]
          : [],
      };
    else if (path.includes("/sessions")) data = { sessions: [], items: [] };
    else if (path.includes("/projects")) data = { projects: [], items: [] };
    else if (path.includes("/teams")) data = { teams: [], items: [] };
    else if (path.includes("/approvals")) data = { approvals: [], items: [] };
    else if (path.includes("/envelopes")) data = { envelopes: [], items: [] };
    else if (path.includes("/invites")) data = { invites: [], items: [] };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data }),
    });
  });
  await page.goto(baseURL + "/settings/devices/add");
  await page
    .getByRole("heading", { name: "Connect a device", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Quick connect (Recommended)", exact: true })
    .click();
  await page.getByText(/PAX_REGISTRATION_TOKEN='preview-token/).waitFor();
  await page.screenshot({ path: "/tmp/pax-onboarding-device-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/pax-onboarding-device-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile page overflows",
  );
  nodes = [{ node_id: "mac", name: "Kevin’s Mac", online: true }];
  await page
    .getByRole("button", { name: /Continue with Kevin/ })
    .click({ timeout: 12000 });
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page.getByText("ACP adapter needed", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/pax-onboarding-agent-mobile.png" });
  available = true;
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await page.getByText("Connection command found", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Connect Codex", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Start a conversation", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/pax-onboarding-connected-mobile.png" });
  assert.equal(
    await page
      .getByRole("link", { name: "Start a conversation" })
      .getAttribute("href"),
    "/sessions/new?agentId=agent&nodeId=mac",
  );
  await page.goto(baseURL + "/settings/devices/agents/add?nodeId=mac");
  await page.getByRole("heading", { name: "Choose your agent" }).waitFor();
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await page.getByText(/PAX found npx/).waitFor();
  nodes = [];
  created = false;
  await page.goto(baseURL + "/settings/devices/add");
  await page
    .getByRole("button", { name: "Browser sign-in", exact: true })
    .click();
  await page.getByText(/PAX_REGISTRATION_TOKEN=''/).waitFor();
  await page.screenshot({ path: "/tmp/pax-onboarding-browser-signin.png" });
  await page.goto(baseURL + "/");
  await page
    .getByRole("heading", { name: "Connect your first agent", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/pax-onboarding-home-mobile.png" });
  await page
    .getByRole("button", { name: "Quick connect (Recommended)", exact: true })
    .click();
  await page.getByText(/PAX_REGISTRATION_TOKEN='preview-token/).waitFor();
  nodes = [{ node_id: "mac", name: "Kevin’s Mac", online: true }];
  await page
    .getByRole("button", { name: /Continue with Kevin/ })
    .click({ timeout: 12000 });
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect Codex", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Start a conversation", exact: true })
    .waitFor();
  await page.waitForTimeout(1000);
  assert.equal(
    await page
      .getByRole("link", { name: "Start a conversation", exact: true })
      .isVisible(),
    true,
    "Home setup disappears when agent cache refreshes",
  );
  await page.screenshot({ path: "/tmp/pax-onboarding-home-connected.png" });
  assert.deepEqual(errors, [], "browser runtime errors");
  console.log(
    JSON.stringify({
      result: "passed",
      checks: [
        "desktop/mobile layout",
        "quick connect",
        "missing ACP",
        "ACP refresh",
        "runtime connection",
        "new conversation link",
        "node-specific Add agent",
        "npx fallback",
        "browser sign-in",
        "Home empty state and retained completion after agent appears",
      ],
      screenshots: "/tmp/pax-onboarding-*.png",
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
