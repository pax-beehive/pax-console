import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

process.umask(0o077);

const origin = new URL(
  process.env.PAX_SEARCH_CONSOLE_URL ?? "http://127.0.0.1:3117",
);
assert(
  origin.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "PAX_SEARCH_CONSOLE_URL must be a loopback HTTP origin for the isolated fixture stack",
);

// Only local fixture runs may attach a private, owner-scoped test API key.
const headersFile = process.env.PAX_BROWSER_TEST_HEADERS_FILE;
let extraHTTPHeaders;
if (headersFile) {
  const metadata = await stat(headersFile);
  assert(
    metadata.isFile() && metadata.size <= 8192 && (metadata.mode & 0o077) === 0,
    "The browser fixture header file must be a small private file (mode 0600)",
  );
  let headers;
  try {
    headers = JSON.parse(await readFile(headersFile, "utf8"));
  } catch {
    throw new Error("The browser fixture header file must contain valid JSON");
  }
  assert(
    headers &&
      Object.keys(headers).length === 1 &&
      typeof headers.Authorization === "string" &&
      /^Bearer [^\s]+$/.test(headers.Authorization),
    "The browser fixture header file must contain only an Authorization Bearer header",
  );
  extraHTTPHeaders = headers;
}

const output = process.env.PAX_SEARCH_SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.PAX_SEARCH_SMOKE_OUTPUT_DIR)
  : await mkdtemp(path.join(tmpdir(), "pax-search-browser-"));
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
const timeout = 45_000;
const pageErrors = [];

function apiResponse(page, suffix, method = "POST", matchesRequest) {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.origin === origin.origin &&
        new RegExp(`^/api/pax/api/v1/user/[^/]+/${suffix}$`).test(
          url.pathname,
        ) &&
        response.request().method() === method &&
        (!matchesRequest || matchesRequest(response.request().postDataJSON()))
      );
    },
    { timeout },
  );
}

async function dataFrom(responsePromise, label) {
  let response;
  try {
    response = await responsePromise;
  } catch {
    throw new Error(
      `${label}: no matching API response arrived within ${timeout}ms`,
    );
  }
  assert.equal(
    response.status(),
    200,
    `${label}: expected successful HTTP response`,
  );
  const body = await response.json();
  assert.equal(
    body.code,
    200,
    `${label}: expected successful Manager envelope`,
  );
  return body.data;
}

async function successfulAction(page, suffix, action, label, matchesRequest) {
  // Observe the real response. No routing, fulfillment, or API stubs are used.
  const pending = dataFrom(
    apiResponse(page, suffix, "POST", matchesRequest),
    label,
  );
  const [data] = await Promise.all([pending, action()]);
  return data;
}

function results(page) {
  return page.getByRole("region", { name: "Search results", exact: true });
}

function selectedSource(page) {
  return page.getByRole("region", { name: "Selected source", exact: true });
}

async function submit(page, query) {
  await page
    .getByRole("searchbox", { name: "Search your workspace", exact: true })
    .fill(query);
  const data = await successfulAction(
    page,
    "search",
    () =>
      page
        .getByRole("form", { name: "Workspace search", exact: true })
        .getByRole("button", { name: "Search", exact: true })
        .click(),
    `Search ${query}`,
    (request) => request.query === query.trim(),
  );
  await page.waitForURL((url) => url.searchParams.get("q") === query.trim());
  assert(Array.isArray(data.hits), "Search must return a hits array");
  if (data.hits.length) {
    await results(page).getByRole("listitem").first().waitFor();
  } else {
    await results(page).getByText("No results", { exact: true }).waitFor();
  }
  return data;
}

async function filter(page, name, expectedKind) {
  const query = new URL(page.url()).searchParams.get("q") || "";
  const data = await successfulAction(
    page,
    "search",
    () =>
      page
        .getByRole("navigation", { name: "Search result type", exact: true })
        .getByRole("button", { name, exact: true })
        .click(),
    `${name} filter`,
    (request) =>
      request.query === query &&
      request.kinds?.length === 1 &&
      request.kinds[0] === expectedKind,
  );
  assert(data.hits.length > 0, `${name} filter must retain the seeded result`);
  assert(
    data.hits.every((hit) => hit.ref.kind === expectedKind),
    `${name} filter returned another kind`,
  );
  await results(page).getByRole("listitem").first().waitFor();
  return data;
}

async function openFirstResult(page) {
  const data = await successfulAction(
    page,
    "search/read",
    () =>
      results(page).getByRole("listitem").first().getByRole("button").click(),
    "Read selected source",
  );
  await selectedSource(page)
    .getByRole("button", { name: "Close source", exact: true })
    .waitFor();
  return data;
}

async function closeSource(page) {
  await selectedSource(page)
    .getByRole("button", { name: "Close source", exact: true })
    .click();
  await selectedSource(page).waitFor({ state: "detached" });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector("main");
    const source = document.querySelector('[aria-label="Selected source"]');
    const form = document.querySelector('form[aria-label="Workspace search"]');
    return {
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      mainRight: main?.getBoundingClientRect().right ?? 0,
      sourceOverflow: source ? source.scrollWidth - source.clientWidth : 0,
      formRight: form?.getBoundingClientRect().right ?? 0,
    };
  });
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `${label}: document overflows horizontally`,
  );
  assert(
    dimensions.mainRight <= dimensions.viewport + 1,
    `${label}: shell exceeds the viewport`,
  );
  assert(
    dimensions.formRight <= dimensions.viewport + 1,
    `${label}: search form exceeds the viewport`,
  );
  assert(
    dimensions.sourceOverflow <= 1,
    `${label}: selected source overflows horizontally`,
  );
}

async function normalUserPage(viewport) {
  const context = await browser.newContext({ viewport, extraHTTPHeaders });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => pageErrors.push(error.name));
  const currentUser = dataFrom(apiResponse(page, "me", "GET"), "Current user");
  await page.goto(new URL("/search", origin).href, {
    waitUntil: "domcontentloaded",
  });
  const { user } = await currentUser;
  assert.equal(
    user.email,
    "local@example.local",
    "Use the isolated stack's local fixture owner",
  );
  assert(
    !user.is_admin && !["admin", "owner"].includes(user.role?.toLowerCase()),
    "Search must be verified with a normal non-admin owner",
  );
  await page
    .getByRole("heading", { level: 1, name: "Search", exact: true })
    .waitFor();
  await page
    .getByRole("searchbox", { name: "Search your workspace", exact: true })
    .waitFor();
  await page.waitForLoadState("networkidle");
  const searchLinks = page.getByRole("link", { name: "Search", exact: true });
  assert(
    (await searchLinks.count()) > 0,
    "Normal owner must have search navigation",
  );
  let visible = false;
  for (const link of await searchLinks.all())
    visible ||= await link.isVisible();
  assert(visible, "Normal owner must see a Search navigation link");
  return { context, page };
}

try {
  const desktop = await normalUserPage({ width: 1440, height: 1000 });
  const page = desktop.page;
  const all = await submit(page, "数据");
  assert(
    all.hits.some(
      (hit) => hit.ref.kind === "message" && hit.ref.id === "search-live-m1",
    ),
    "Chinese substring must find the multipart message",
  );
  assert(
    all.hits.some(
      (hit) =>
        hit.ref.kind === "summary" && hit.ref.id === "search-live-summary",
    ),
    "All results must include the published summary",
  );
  assert(
    !all.hits.some((hit) => hit.ref.id === "search-live-hidden"),
    "Another owner's message must not appear",
  );
  const messages = await filter(page, "Messages", "message");
  assert.deepEqual(
    messages.hits.map((hit) => hit.ref.id),
    ["search-live-m1"],
    "Only the expected fixture message should match 数据",
  );
  const multipart = await openFirstResult(page);
  assert.equal(multipart.message_id, "search-live-m1");
  assert.equal(
    multipart.text,
    "数据库",
    "Transport parts must appear as one visible message",
  );
  assert(multipart.read_receipt, "Source reads must include a read receipt");
  await selectedSource(page)
    .getByRole("article", { name: "Message text", exact: true })
    .getByText("数据库", { exact: true })
    .waitFor();
  await closeSource(page);
  console.log(
    "PASS real HTTP search: Chinese multipart substring, owner isolation, message filter and source read",
  );

  const singleCharacter = await submit(page, "本");
  assert(
    singleCharacter.hits.some((hit) => hit.ref.id === "search-live-m2"),
    "A single character must match 苹果笔记本",
  );
  const sessions = await filter(page, "Sessions", "session");
  assert(
    sessions.hits.some((hit) => hit.title === "苹果笔记本"),
    "Session title should match the single character",
  );
  const session = await openFirstResult(page);
  assert.equal(session.kind, "session");
  assert.equal(session.title, "苹果笔记本");
  await selectedSource(page)
    .getByRole("link", { name: "Open session", exact: true })
    .waitFor();
  await closeSource(page);
  assert.equal(
    (await submit(page, "华为笔记本")).hits.length,
    0,
    "An unrelated literal phrase must not match the session title",
  );
  const unrelatedAll = await successfulAction(
    page,
    "search",
    () =>
      page
        .getByRole("navigation", { name: "Search result type", exact: true })
        .getByRole("button", { name: "All", exact: true })
        .click(),
    "Unrelated phrase across all kinds",
  );
  assert.equal(
    unrelatedAll.hits.length,
    0,
    "An unrelated complete phrase must not match any source kind",
  );
  await results(page).getByText("No results", { exact: true }).waitFor();
  console.log(
    "PASS literal matching: one character, session title filter, unrelated phrase excluded",
  );

  await submit(page, "visible paragraph");
  const last = await openFirstResult(page);
  assert.equal(last.message_id, "search-live-m3");
  assert.equal(last.view, "last");
  assert.equal(last.text, "Final visible paragraph.");
  assert(
    last.context?.some((item) => item.message_id === "search-live-m1"),
    "Selected message must include bounded preceding context",
  );
  await selectedSource(page)
    .getByRole("article", { name: "Context message", exact: true })
    .first()
    .waitFor();
  const first = await successfulAction(
    page,
    "search/read",
    () =>
      selectedSource(page)
        .getByRole("button", { name: "First paragraph", exact: true })
        .click(),
    "First paragraph",
  );
  assert.equal(first.text, "First visible paragraph.");
  const full = await successfulAction(
    page,
    "search/read",
    () =>
      selectedSource(page)
        .getByRole("button", { name: "Full message", exact: true })
        .click(),
    "Full message",
  );
  assert.equal(full.view, "full");
  assert.equal(
    full.text,
    "First visible paragraph.\n\nFinal visible paragraph.",
  );
  assert.equal(
    first.ref.content_hash,
    last.ref.content_hash,
    "Views must retain the same full-body version",
  );
  assert.equal(
    full.ref.content_hash,
    last.ref.content_hash,
    "Full view must retain the same version",
  );
  await selectedSource(page)
    .getByRole("article", { name: "Message text", exact: true })
    .getByText(full.text, { exact: true })
    .waitFor();
  await assertNoOverflow(page, "Desktop selected message");
  await page.screenshot({
    path: path.join(output, "desktop-message.png"),
    fullPage: true,
  });
  await closeSource(page);
  console.log(
    "PASS source views: default last, first, full and bounded message context",
  );

  // Source navigation may legitimately reuse a fresh TanStack read. Reload to
  // exercise summary traversal with a fresh cache and observe its actual POST.
  await page.reload({ waitUntil: "networkidle" });
  await submit(page, "Search decision");
  await filter(page, "Summaries", "summary");
  const summary = await openFirstResult(page);
  assert.equal(summary.summary_id, "search-live-summary");
  assert.equal(summary.revision, 1);
  const covered = summary.coverage.find(
    (ref) => ref.message_id === "search-live-m1",
  );
  assert(
    covered,
    "Seed summary must freeze its exact multipart message source",
  );
  await selectedSource(page)
    .getByRole("article", { name: "Summary text", exact: true })
    .getByText("Use 数据库", { exact: true })
    .waitFor();
  await assertNoOverflow(page, "Desktop summary");
  await page.screenshot({
    path: path.join(output, "desktop-summary.png"),
    fullPage: true,
  });
  const frozen = await successfulAction(
    page,
    "search/read",
    () =>
      selectedSource(page)
        .getByRole("region", { name: "Summary sources", exact: true })
        .getByRole("button", { name: "search-live-m1", exact: true })
        .click(),
    "Frozen summary source",
  );
  assert.equal(frozen.message_id, covered.message_id);
  assert.equal(
    frozen.ref.content_hash,
    covered.content_hash,
    "Coverage must read the exact frozen source hash",
  );
  assert.equal(
    frozen.ref.canonicalization_version,
    covered.canonicalization_version,
  );
  assert.equal(frozen.text, "数据库");
  console.log(
    "PASS summary filter and exact versioned message coverage traversal",
  );
  await desktop.context.close();

  const mobile = await normalUserPage({ width: 390, height: 844 });
  const mobilePage = mobile.page;
  await mobilePage
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Search", exact: true })
    .waitFor({ state: "visible" });
  await submit(mobilePage, "本");
  await assertNoOverflow(mobilePage, "Mobile search results");
  await mobilePage.screenshot({
    path: path.join(output, "mobile-results.png"),
    fullPage: true,
  });
  await filter(mobilePage, "Messages", "message");
  const mobileMessage = await openFirstResult(mobilePage);
  assert.equal(mobileMessage.message_id, "search-live-m2");
  await selectedSource(mobilePage)
    .getByRole("article", { name: "Message text", exact: true })
    .getByText("苹果笔记本", { exact: true })
    .waitFor();
  await assertNoOverflow(mobilePage, "Mobile selected source");
  await mobilePage.screenshot({
    path: path.join(output, "mobile-message.png"),
    fullPage: true,
  });
  await selectedSource(mobilePage)
    .getByRole("button", { name: "Back to results", exact: true })
    .click();
  await results(mobilePage).waitFor({ state: "visible" });
  assert.equal(
    await selectedSource(mobilePage).count(),
    0,
    "Mobile back must close the source panel",
  );
  await mobile.context.close();
  console.log(
    "PASS 390×844 mobile: visible Search navigation, results, source, back and no horizontal overflow",
  );
  assert.equal(
    pageErrors.length,
    0,
    "Browser encountered an uncaught page error",
  );
  console.log(`All browser smoke checks passed. Screenshots: ${output}`);
} catch (error) {
  let failureIndex = 0;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (!page.isClosed()) {
        await page
          .screenshot({
            path: path.join(output, `failure-${++failureIndex}.png`),
            fullPage: true,
          })
          .catch(() => {});
      }
    }
  }
  // Avoid dumping response bodies, read receipts, cookies, headers, or keys.
  console.error(
    `FAIL ${error instanceof Error ? error.message : "Browser smoke failed"}`,
  );
  console.error(`Screenshot directory: ${output}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
