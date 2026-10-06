import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const screenshots = process.argv[3];
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});

try {
  // A crawler must receive actual visible content without JavaScript or cookies.
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const rawPage = await noScript.newPage();
  const response = await rawPage.goto(`${base}/overview`);
  assert.equal(response.status(), 200);
  assert.match(await rawPage.locator("h1").innerText(), /不同 Agent/);
  assert.match(await rawPage.title(), /PaxWorkspace/);
  assert.equal(
    await rawPage.locator('link[rel="canonical"]').getAttribute("href"),
    "https://paxworkspace.net/overview",
  );
  assert.equal(
    await rawPage.locator('meta[name="robots"]').getAttribute("content"),
    "index, follow",
  );
  assert.match(
    await rawPage.locator('meta[name="description"]').getAttribute("content"),
    /PaxWorkspace/,
  );
  const structured = JSON.parse(
    await rawPage.locator('script[type="application/ld+json"]').textContent(),
  );
  assert.equal(structured.about.name, "PaxWorkspace");
  assert.equal(structured.url, "https://paxworkspace.net/overview");
  const imageUrl = await rawPage
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  assert.equal(imageUrl, "https://paxworkspace.net/paxworkspace-social.png");
  const card = await noScript.request.get(
    `${base}${new URL(imageUrl).pathname}`,
  );
  assert.equal(card.status(), 200);
  assert.match(card.headers()["content-type"], /image\/png/);
  const png = await card.body();
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const robots = await noScript.request.get(`${base}/robots.txt`);
  assert.equal(robots.status(), 200);
  assert.match(
    await robots.text(),
    /Sitemap: https:\/\/paxworkspace.net\/sitemap.xml/,
  );
  const sitemap = await noScript.request.get(`${base}/sitemap.xml`);
  assert.equal(sitemap.status(), 200);
  const xml = await sitemap.text();
  assert.equal((xml.match(/<loc>/g) ?? []).length, 1);
  assert.ok(xml.includes("<loc>https://paxworkspace.net/overview</loc>"));
  await noScript.close();

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1100 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const accountRequests = [];
    const errors = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        accountRequests.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/overview`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").count(), 1);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.getByText("PaxWorkspace 是什么？", { exact: true }).click();
    assert.equal(
      await page.locator("details").first().getAttribute("open"),
      "",
    );
    assert.deepEqual(
      accountRequests,
      [],
      "Public overview must not bootstrap accounts or prefetch workbench APIs",
    );
    assert.deepEqual(errors, []);
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: path.join(screenshots, `paxworkspace-overview-${name}.png`),
        fullPage: true,
      });
    }
    await page.route("**/api/region-config", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      }),
    );
    await page.route("**/api/pax/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: "{}",
      }),
    );
    await page.getByRole("link", { name: "开始使用", exact: true }).click();
    await page.waitForURL(`${base}/`);
    await page
      .getByRole("heading", { name: "Sign in to open PAX Console." })
      .waitFor();
    assert.ok(
      accountRequests.some(
        (url) => new URL(url).pathname === "/api/region-config",
      ),
    );
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute("content"),
      "noindex, follow",
    );
    await context.close();
  }
  console.log(
    "PASS: no-JS HTML, SEO metadata, sitemap, robots, share image, desktop/mobile layout, and workbench auth boundary",
  );
} finally {
  await browser.close();
}
