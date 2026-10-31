import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

process.umask(0o077);
const origin = new URL(
  process.env.PAX_SECRETARY_CONSOLE_URL ?? "http://127.0.0.1:3117",
);
assert(
  origin.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "Use a loopback Console origin connected to an isolated Secretary fixture stack",
);
const agentId = process.env.PAX_SECRETARY_SMOKE_AGENT_ID;
assert(
  agentId,
  "Set PAX_SECRETARY_SMOKE_AGENT_ID to the isolated fixture's owned test agent",
);
const expectedEmail =
  process.env.PAX_SECRETARY_SMOKE_OWNER_EMAIL ?? "local@example.local";
const output = process.env.PAX_SECRETARY_SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.PAX_SECRETARY_SMOKE_OUTPUT_DIR)
  : await mkdtemp(path.join(tmpdir(), "pax-secretary-browser-"));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
const timeout = 45000;
const errors = [];
const contexts = [];
let initial;
let restorePage;
let settingsPath;
let changedSettings = false;

function responseFor(page, method, suffix = "secretary") {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.origin === origin.origin &&
        new RegExp(`^/api/pax/api/v1/user/[^/]+/${suffix}$`).test(
          url.pathname,
        ) &&
        response.request().method() === method
      );
    },
    { timeout },
  );
}
async function readResponse(responsePromise) {
  const response = await responsePromise;
  assert(
    response.status() >= 200 && response.status() < 300,
    `Expected successful HTTP response, got ${response.status()}`,
  );
  const envelope = await response.json();
  assert(
    envelope.code >= 200 && envelope.code < 300,
    "Expected successful Manager envelope",
  );
  return envelope.data;
}
async function actionResponse(page, method, action, suffix) {
  const pending = readResponse(responseFor(page, method, suffix));
  const [data] = await Promise.all([pending, action()]);
  return data;
}
async function currentSettings(page) {
  return readResponse(page.request.get(new URL(settingsPath, origin).href));
}
function coverageText(counts) {
  const turns = counts.ungrouped_messages === 0 && counts.total_turns > 0;
  const total = turns ? counts.total_turns : counts.total_messages;
  const completed = turns ? counts.completed_turns : counts.completed_messages;
  const pending = turns ? counts.pending_turns : counts.pending_messages;
  return `${completed} of ${total} ${turns ? (total === 1 ? "turn" : "turns") : total === 1 ? "message" : "messages"} summarized · ${pending} remaining`;
}
async function assertProgress(page) {
  const data = await readResponse(
    page.request.get(new URL(`${settingsPath}/progress?limit=20`, origin).href),
  );
  assert(
    data.counts.total_sessions > 0,
    "Unread eligible fixture sessions must be counted even while Secretary is disabled",
  );
  assert.equal(
    data.counts.total_sessions,
    data.counts.completed_sessions +
      data.counts.partial_sessions +
      data.counts.unstarted_sessions,
  );
  const overview = page.getByRole("region", {
    name: "Summary progress",
    exact: true,
  });
  await overview
    .getByText(coverageText(data.counts), { exact: true })
    .waitFor();
  for (const [label, key] of [
    ["Sessions tracked", "total_sessions"],
    ["Up to date", "completed_sessions"],
    ["Partly summarized", "partial_sessions"],
    ["Awaiting summary", "unstarted_sessions"],
  ]) {
    assert.equal(
      await overview
        .getByText(label, { exact: true })
        .locator("..")
        .locator("dd")
        .innerText(),
      String(data.counts[key]),
    );
  }
  const list = page.getByRole("list", {
    name: "Session progress list",
    exact: true,
  });
  for (const session of data.sessions) {
    const row = list
      .getByRole("listitem")
      .filter({
        has: page.getByRole("link", {
          name: session.title || "Untitled session",
          exact: true,
        }),
      })
      .filter({ hasText: session.session_id });
    await row.getByText(coverageText(session), { exact: true }).waitFor();
    assert.equal(
      await row.getByRole("link").getAttribute("href"),
      `/?session_id=${encodeURIComponent(session.session_id)}`,
    );
  }
  return data;
}
async function openPage(viewport, pathname) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => errors.push(error.name));
  const userResponse = readResponse(responseFor(page, "GET", "me"));
  await page.goto(new URL(pathname, origin).href, {
    waitUntil: "domcontentloaded",
  });
  const { user } = await userResponse;
  assert.equal(user.email, expectedEmail, "Use the isolated fixture owner");
  assert(
    !user.is_admin && !["admin", "owner"].includes(user.role?.toLowerCase()),
    "Verify Secretary with a normal signed-in user",
  );
  return page;
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
    form:
      document
        .querySelector('form[aria-label="Secretary settings"]')
        ?.getBoundingClientRect().right ?? 0,
  }));
  assert(
    dimensions.page <= dimensions.viewport + 1,
    `${label}: horizontal document overflow`,
  );
  assert(
    dimensions.form <= dimensions.viewport + 1,
    `${label}: settings form exceeds viewport`,
  );
}

try {
  const page = await openPage(
    { width: 1440, height: 1000 },
    "/settings/secretary",
  );
  restorePage = page;
  await page.getByRole("heading", { name: "Secretary", exact: true }).waitFor();
  await page
    .getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("link", { name: /^Secretary/ })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Secretary agent", exact: true })
    .waitFor();
  const me = await readResponse(
    page.request.get(new URL("/api/pax/api/v1/user/self/me", origin).href),
  );
  settingsPath = `/api/pax/api/v1/user/${encodeURIComponent(me.user.user_id)}/secretary`;
  initial = await currentSettings(page);
  await page
    .getByRole("region", { name: "Secretary status", exact: true })
    .getByText("Queued", { exact: true })
    .waitFor();
  assert.equal(
    initial.enabled,
    false,
    "The isolated fixture must begin disabled; do not interrupt an active Secretary",
  );
  await assertProgress(page);
  const selector = page.getByRole("combobox", {
    name: "Secretary agent",
    exact: true,
  });
  await page.waitForFunction(
    (value) =>
      Array.from(
        document.querySelector("#secretary-agent")?.options ?? [],
      ).some((option) => option.value === value),
    agentId,
    { timeout },
  );
  assert(
    await selector
      .locator("option")
      .evaluateAll(
        (options, value) => options.some((option) => option.value === value),
        agentId,
      ),
    "Fixture agent must appear in the owned-agent selector",
  );
  await selector.selectOption(agentId);
  await page
    .getByRole("switch", { name: "Automatic summaries", exact: true })
    .click();
  await actionResponse(
    page,
    "GET",
    () =>
      page
        .getByRole("region", { name: "Summary progress", exact: true })
        .getByRole("button", { name: "Refresh progress", exact: true })
        .click(),
    "secretary/progress",
  );
  assert.equal(
    await selector.inputValue(),
    agentId,
    "Progress refresh must preserve the unsaved agent selection",
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "Automatic summaries", exact: true })
      .getAttribute("aria-checked"),
    "true",
    "Progress refresh must preserve the unsaved toggle",
  );
  assert.equal(
    (await currentSettings(page)).enabled,
    false,
    "Draft changes must not enable background work before Save settings",
  );
  changedSettings = true;
  const enabled = await actionResponse(page, "PATCH", () =>
    page.getByRole("button", { name: "Save settings", exact: true }).click(),
  );
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.agent_id, agentId);
  assert(
    enabled.revision > initial.revision,
    "Settings revision must advance on save",
  );
  await page.getByText("Settings saved.", { exact: true }).waitFor();
  await noOverflow(page, "Desktop Secretary settings");
  await page
    .getByRole("region", { name: "Summary progress", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, "desktop-secretary-enabled.png"),
    fullPage: true,
  });
  console.log(
    "PASS real settings: normal user, existing owned agent, explicit save, persisted enablement",
  );
  await page.getByRole("link", { name: "View sessions", exact: true }).click();
  await page.screenshot({
    path: path.join(output, "desktop-secretary-progress.png"),
    fullPage: true,
  });
  console.log(
    "PASS real progress: authoritative eligible totals, exact row coverage, source links and refresh preserves draft",
  );

  const reloaded = actionResponse(page, "GET", () =>
    page.reload({ waitUntil: "domcontentloaded" }),
  );
  assert.equal(
    (await reloaded).enabled,
    true,
    "Enablement must survive browser reload",
  );
  await page
    .getByRole("region", { name: "Secretary status", exact: true })
    .waitFor();
  const runButton = page.getByRole("button", { name: /^(Run now|Retry run)$/ });
  await runButton.waitFor();
  if (await runButton.isEnabled()) {
    const requested = await actionResponse(
      page,
      "POST",
      () => page.getByRole("button", { name: /^(Run now|Retry run)$/ }).click(),
      "secretary/run",
    );
    assert.equal(requested.enabled, true);
    await page.getByText("Run requested.", { exact: true }).waitFor();
    console.log(
      "PASS real HTTP manual run request accepted without claiming completion",
    );
  } else {
    await page.getByRole("button", { name: /^(Run now|Retry run)$/ }).waitFor();
    assert(
      await page
        .getByRole("button", { name: /^(Run now|Retry run)$/ })
        .isDisabled(),
      "Disconnected or processing agents must not accept another manual run",
    );
    console.log(
      "PASS real runtime: manual run unavailable while processing or waiting for agent",
    );
  }

  const mobile = await openPage({ width: 390, height: 844 }, "/settings");
  const secretaryLink = mobile.getByRole("link", { name: /^Secretary/ });
  await secretaryLink.waitFor();
  const mobileRead = await actionResponse(mobile, "GET", () =>
    secretaryLink.click(),
  );
  assert.equal(mobileRead.enabled, true);
  await mobile
    .getByRole("combobox", { name: "Secretary agent", exact: true })
    .waitFor();
  await assertProgress(mobile);
  assert.equal(
    await mobile
      .getByRole("switch", { name: "Automatic summaries", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await noOverflow(mobile, "Mobile Secretary settings");
  await mobile.screenshot({
    path: path.join(output, "mobile-secretary-enabled.png"),
    fullPage: true,
  });
  await mobile
    .getByRole("link", { name: "View sessions", exact: true })
    .click();
  await noOverflow(mobile, "Mobile session progress");
  await mobile.screenshot({
    path: path.join(output, "mobile-secretary-progress.png"),
    fullPage: true,
  });
  const mobileRun = mobile.getByRole("button", {
    name: /^(Run now|Retry run)$/,
  });
  await mobileRun.scrollIntoViewIfNeeded();
  const runBounds = await mobileRun.boundingBox();
  const navBounds = await mobile
    .getByRole("navigation", { name: "Primary", exact: true })
    .boundingBox();
  assert(
    runBounds && navBounds && runBounds.y + runBounds.height <= navBounds.y + 1,
    "Mobile run controls must scroll above the fixed bottom navigation",
  );
  await mobile.screenshot({
    path: path.join(output, "mobile-secretary-controls.png"),
    fullPage: true,
  });
  await mobile
    .getByRole("switch", { name: "Automatic summaries", exact: true })
    .click();
  const disabled = await actionResponse(mobile, "PATCH", () =>
    mobile.getByRole("button", { name: "Save settings", exact: true }).click(),
  );
  assert.equal(disabled.enabled, false);
  const mobileReload = await actionResponse(mobile, "GET", () =>
    mobile.reload({ waitUntil: "domcontentloaded" }),
  );
  assert.equal(mobileReload.enabled, false);
  await mobile
    .getByRole("region", { name: "Secretary status", exact: true })
    .getByText("Off", { exact: true })
    .waitFor();
  await noOverflow(mobile, "Mobile disabled settings");
  await mobile.screenshot({
    path: path.join(output, "mobile-secretary-disabled.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, [], "No browser runtime errors are expected");
  console.log(
    "PASS real mobile navigation, persisted disablement and responsive layout",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  try {
    if (changedSettings && initial && restorePage && settingsPath) {
      const current = await currentSettings(restorePage);
      const restored = await readResponse(
        restorePage.request.patch(new URL(settingsPath, origin).href, {
          data: {
            agent_id: initial.agent_id ?? "",
            enabled: initial.enabled,
            expected_revision: current.revision,
          },
        }),
      );
      assert.equal(
        restored.enabled,
        initial.enabled,
        "Restore the initial enablement",
      );
      assert.equal(
        restored.agent_id ?? "",
        initial.agent_id ?? "",
        "Restore the initial selected agent",
      );
      console.log("PASS isolated fixture settings restored disabled");
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
}
