import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

// Explicitly fictional data; this checks the real UI, not Manager integration.
const origin = new URL(
  process.env.PAX_SUMMARY_CONSOLE_URL ?? "http://127.0.0.1:3124",
);
assert(["localhost", "127.0.0.1"].includes(origin.hostname));
const output = await mkdtemp(path.join(tmpdir(), "pax-summary-nodes-browser-"));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
const metadata = {
  node_type: "summary",
  node_status: "active",
  origin_source_id: "source_1",
  origin_session_id: "sess_origin",
  origin_session_title: "Search and deployment",
  created_at: "2026-11-03T18:00:00Z",
};
const summary = {
  ...metadata,
  summary_id: "summary_1",
  revision: 3,
  owner_user_id: "fixture",
  subject_type: "fragment",
  subject_id: "not-a-session",
  title: "Database decisions",
  body: "Keep **originals** in PostgreSQL.",
  claims: [],
  coverage: [
    {
      message_id: "message_1",
      content_hash: "frozen",
      canonicalization_version: "visible-v1",
    },
  ],
};
const item = {
  ...summary,
  body_preview: "Keep originals in PostgreSQL.",
  claim_count: 0,
  coverage_count: 1,
  summary_source_count: 0,
};
const message = {
  ref: {
    kind: "message",
    id: "message_1",
    content_hash: "frozen",
    canonicalization_version: "visible-v1",
  },
  message_id: "message_1",
  agent_id: "agent_1",
  session_id: "sess_origin",
  role: "assistant",
  session_seq: 5,
  created_at: metadata.created_at,
  text: "Keep originals in PostgreSQL.",
  view: "last",
  available_views: ["last", "full"],
  has_more: false,
  read_receipt: "fictional",
};
let historyRequests = 0;
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    await page.route("**/api/region-config", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/pax/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const ok = (data) => route.fulfill({ json: { code: 200, data } });
      if (url.pathname.endsWith("/me"))
        return ok({
          user: {
            user_id: "fixture",
            email: "fixture@example.invalid",
            role: "user",
          },
        });
      if (url.pathname.endsWith("/secretary/summaries"))
        return ok({
          items: [
            item,
            {
              ...item,
              summary_id: "summary_2",
              title: "Deployment recovery",
              body_preview: "Resolve the startup failure.",
            },
          ],
        });
      if (url.pathname.endsWith("/summary_1/revisions")) {
        historyRequests++;
        return ok({
          items: [
            { ...item, revision: 3 },
            { ...item, revision: 1 },
          ],
        });
      }
      if (url.pathname.endsWith("/search/read")) {
        const { ref } = request.postDataJSON();
        return ok(
          ref.kind === "message"
            ? message
            : {
                ...summary,
                revision: ref.revision ?? 3,
                body:
                  ref.revision === 1
                    ? "The first saved decision."
                    : summary.body,
              },
        );
      }
      if (url.pathname.endsWith("/notification-settings"))
        return ok({ enabled: false, turn_completion_enabled: false });
      return ok([]);
    });
    const before = historyRequests;
    await page.goto(new URL("/settings/secretary/summaries", origin).href);
    await page
      .getByRole("link", { name: "Read Database decisions, version 3" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("list", { name: "Summary list" })
        .getByRole("listitem")
        .count(),
      2,
    );
    await page
      .getByRole("link", { name: "Read Database decisions, version 3" })
      .click();
    await page.getByRole("article", { name: "Summary text" }).waitFor();
    assert.equal(historyRequests, before, "History must load on demand");
    await page.getByRole("button", { name: "Version history" }).click();
    await page.getByRole("button", { name: "Read version 1" }).click();
    await page
      .getByText("The first saved decision.", { exact: true })
      .waitFor();
    assert(new URL(page.url()).searchParams.get("revision") === "1");
    await page.getByRole("button", { name: "message_1", exact: true }).click();
    await page
      .getByRole("link", { name: "Open session", exact: false })
      .waitFor();
    await page.getByRole("button", { name: "Close source" }).click();
    await page
      .getByText("The first saved decision.", { exact: true })
      .waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert.equal(
      overflow,
      false,
      `No horizontal overflow at ${viewport.width}px`,
    );
    await page.screenshot({
      path: path.join(output, `summary-${viewport.width}.png`),
    });
    await context.close();
  }
  process.stdout.write(
    JSON.stringify({
      pass: true,
      fixtures: true,
      desktop: true,
      mobile: true,
      output,
    }) + "\n",
  );
} finally {
  await browser.close();
}
