import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

// UI-only fixture. Every API is intercepted; no production account, provider,
// credentials, or cloud resource is used. Backend contracts have separate tests.
const origin = new URL(
  process.env.PAX_GATEWAY_CONSOLE_URL ?? "http://127.0.0.1:3126",
);
assert(
  origin.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    origin.pathname === "/" &&
    !origin.username &&
    !origin.password &&
    !origin.search &&
    !origin.hash,
  "Use a loopback HTTP origin for this UI fixture",
);
const output = process.env.PAX_GATEWAY_SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.PAX_GATEWAY_SMOKE_OUTPUT_DIR)
  : await mkdtemp(path.join(tmpdir(), "pax-model-gateway-"));
await mkdir(output, { recursive: true });

const initial = {
  revision: 7,
  enabled: true,
  pool: {
    monthly_limit_microusd: 100_000_000,
    spent_microusd: 10_500_000,
    reserved_microusd: 500_000,
    remaining_microusd: 89_000_000,
    period_start: "2026-11-01T00:00:00Z",
    resets_at: "2026-12-01T00:00:00Z",
    available: true,
  },
  defaults: { monthly_microusd: 5_000_000, monthly_tokens: 200_000 },
  users: [
    {
      user_id: "usr_fixture_trial",
      environment_id: "env_fixture",
      name: "Trial user",
      email: "trial@example.test",
      access_paused: false,
      monthly_microusd: 5_000_000,
      monthly_tokens: 200_000,
      quota: {
        granted_microusd: 5_000_000,
        spent_microusd: 1_000_000,
        reserved_microusd: 500_000,
        remaining_microusd: 3_500_000,
        granted_tokens: 200_000,
        spent_tokens: 10_000,
        reserved_tokens: 1_000,
        remaining_tokens: 189_000,
        period_start: "2026-11-01T00:00:00Z",
        resets_at: "2026-12-01T00:00:00Z",
      },
    },
  ],
  models: [
    {
      id: "free-frontier",
      provider: "openrouter",
      upstream_model: "vendor/frontier",
      moderation: "openai",
      policy_version: "base-v1",
      enabled: true,
      max_output_tokens: 10_000,
      input_microusd_per_million: 3_000_000,
      output_microusd_per_million: 15_000_000,
    },
  ],
  model_bases: { "free-frontier": "fixture-base-v1" },
  requests: [
    {
      id: "env_fixture:request_fixture",
      request_id: "request_fixture",
      environment_id: "env_fixture",
      user_id: "usr_fixture_trial",
      model: "free-frontier",
      provider: "openrouter",
      upstream_model: "vendor/frontier",
      status: "moderation_blocked",
      moderation_verdict: "blocked",
      spent_microusd: 0,
      reserved_microusd: 0,
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      generation_started: false,
      error_code: "moderation_blocked",
      created_at: "2026-11-13T10:00:00Z",
    },
  ],
  audit: [
    {
      actor_user_id: "usr_fixture_admin",
      action: "pool",
      target_id: "",
      revision: 7,
      created_at: "2026-11-13T09:00:00Z",
    },
  ],
};
let state = structuredClone(initial);
let admin = true;
let rejectRead = false;
let writes = [];
let reads = 0;
const unexpectedAPI = [];
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});

async function fixture(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const data = (value) => json({ code: 200, data: value });
    if (url.pathname === "/api/region-config") return json({ enabled: false });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/pax/api/v1/user/self/me")
      return data({
        user: {
          user_id: "usr_fixture_admin",
          display_name: "Fixture operator",
          email: "admin@example.test",
          is_admin: admin,
          role: admin ? "admin" : "user",
        },
      });
    if (url.pathname === "/api/pax/api/v1/user/self/customer-visit")
      return data({ recorded: true });
    if (url.pathname === "/api/pax/api/v1/user/self/hosting-admin") {
      if (request.method() === "GET") {
        reads++;
        return rejectRead
          ? json({ code: 403, message: "Forbidden" }, 403)
          : data(state);
      }
      const change = request.postDataJSON();
      writes.push(change);
      if (
        change.revision !== state.revision ||
        (change.action === "model" &&
          change.expected_model_base !== state.model_bases[change.target_id])
      )
        return json(
          { code: 409, message: "hosting_admin_revision_conflict" },
          409,
        );
      if (change.action === "pool") {
        state.pool.monthly_limit_microusd = change.monthly_microusd;
        state.pool.remaining_microusd = Math.max(
          0,
          change.monthly_microusd -
            state.pool.spent_microusd -
            state.pool.reserved_microusd,
        );
      } else if (change.action === "user") {
        Object.assign(state.users[0], { access_paused: change.access_paused });
      } else if (change.action === "model") {
        for (const field of [
          "enabled",
          "moderation",
          "max_output_tokens",
          "input_microusd_per_million",
          "output_microusd_per_million",
        ]) {
          if (Object.hasOwn(change, field))
            state.models[0][field] = change[field];
        }
      } else if (change.action === "defaults") {
        Object.assign(state.defaults, {
          monthly_microusd: change.monthly_microusd,
          monthly_tokens: change.monthly_tokens,
        });
      }
      state.revision++;
      return data(state);
    }
    if (url.pathname === "/api/pax/api/v1/user/self/features")
      return data({ revision: 1, features: {} });
    if (
      [
        "/api/pax/api/v1/user/self/approval-grants",
        "/api/pax/api/v1/user/usr_fixture_admin/approval-grants",
      ].includes(url.pathname)
    )
      return data({ grants: [] });
    unexpectedAPI.push(`${request.method()} ${url.pathname}`);
    return json({ code: 404, message: "Unmocked fixture API" }, 404);
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await fixture(context);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(new URL("/admin/model-gateway", origin).href, {
    timeout: 120_000,
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Model gateway", exact: true })
    .waitFor();
  await page.getByLabel("Platform monthly budget (USD)").waitFor();
  const settingsNav = page.getByRole("navigation", {
    name: "Settings",
    exact: true,
  });
  await settingsNav.getByRole("link", { name: /Model gateway/ }).waitFor();
  assert.equal(
    await settingsNav
      .getByRole("link", { name: /Model gateway/ })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    await settingsNav
      .getByRole("link", { name: /Runtime configuration/ })
      .getAttribute("href"),
    "/admin/config",
  );
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );

  // Two administrators: another actor commits after this tab's edit starts.
  await page.getByLabel("Platform monthly budget (USD)").fill("150");
  state.revision++;
  state.pool.monthly_limit_microusd = 200_000_000;
  const previousReads = reads;
  await page
    .getByRole("button", { name: "Save platform pool", exact: true })
    .click();
  await page.getByText(/Settings changed on the server/).waitFor();
  assert.equal(
    await page.getByLabel("Platform monthly budget (USD)").inputValue(),
    "150",
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].revision, 7);
  assert(reads > previousReads, "A conflict must refetch");
  await page
    .getByRole("button", { name: "Reload this form", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Platform monthly budget (USD)").inputValue(),
    "200",
  );
  await page.getByLabel("Platform monthly budget (USD)").fill("250.000001");
  await page
    .getByRole("button", { name: "Save platform pool", exact: true })
    .click();
  await page.getByText("Saved.", { exact: true }).waitFor();
  assert.equal(writes.at(-1).monthly_microusd, 250_000_001);

  await page.getByText("trial@example.test", { exact: true }).click();
  await page
    .getByRole("switch", { name: "Pause free access for usr_fixture_trial" })
    .click();
  await page
    .getByRole("button", { name: "Save user usr_fixture_trial", exact: true })
    .click();
  await page.getByText("Access paused", { exact: true }).waitFor();
  assert.deepEqual(Object.keys(writes.at(-1)).sort(), [
    "access_paused",
    "action",
    "revision",
    "target_id",
  ]);
  await page.locator("summary").filter({ hasText: "free-frontier" }).click();
  await page.getByLabel("Safety policy for free-frontier").selectOption("off");
  await page
    .getByText("Requests to this model skip the OpenAI safety check.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Save model free-frontier", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Model free-frontier", exact: true })
    .getByText("Saved.", { exact: true })
    .waitFor();
  assert.equal(writes.at(-1).expected_model_base, "fixture-base-v1");
  await page.screenshot({
    path: path.join(output, "desktop-edits.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Model gateway", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  // The current Settings layout and administrator preview share one catalog.
  const readsBeforePreview = reads;
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Preview as user", exact: true })
    .click();
  await page
    .getByText(/Model gateway management is available to administrators/)
    .waitFor();
  assert.equal(
    reads,
    readsBeforePreview,
    "Preview must not issue administration queries",
  );
  assert.equal(
    await page.getByText("trial@example.test", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Preview as user", exact: true })
    .click();
  await page.getByLabel("Platform monthly budget (USD)").waitFor();

  rejectRead = true;
  await page
    .getByRole("button", { name: "Refresh settings", exact: true })
    .click();
  await page
    .getByText(/Model gateway management is available to administrators/)
    .waitFor();
  assert.equal(
    await page.getByText("trial@example.test", { exact: true }).count(),
    0,
  );
  await context.close();

  rejectRead = false;
  admin = false;
  const ordinary = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await fixture(ordinary);
  const userPage = await ordinary.newPage();
  const beforeNonAdmin = reads;
  await userPage.goto(new URL("/admin/model-gateway", origin).href);
  await userPage
    .getByText(/Model gateway management is available to administrators/)
    .waitFor();
  assert.equal(reads, beforeNonAdmin, "Non-admin must not request admin data");
  assert.equal(
    await userPage
      .getByRole("link", { name: "Model gateway", exact: true })
      .count(),
    0,
  );
  await userPage.screenshot({
    path: path.join(output, "non-admin.png"),
    fullPage: true,
  });
  await ordinary.close();
  assert.deepEqual(unexpectedAPI, []);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      scope: "mocked local UI only",
      reads,
      writes: writes.length,
      screenshots: output,
    }),
  );
} finally {
  await browser.close();
}
