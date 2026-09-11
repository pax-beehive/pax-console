import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createServer } = await import(
  createRequire(require.resolve("vitest")).resolve("vite")
);
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.umask(0o077);
const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(fixtureRoot, "../..");
const server = await createServer({
  configFile: false,
  root: fixtureRoot,
  resolve: { alias: { "@": path.join(projectRoot, "src") } },
  define: {
    "process.env.NEXT_PUBLIC_PAX_API_BASE_URL": '"/api/pax"',
    "process.env.NEXT_PUBLIC_PAX_USER_SCOPE": '"self"',
    "process.env.NEXT_PUBLIC_PAX_LOGOUT_URL": '"/logout"',
  },
  server: {
    host: "127.0.0.1",
    port: 17433,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => console.log("Page error:", e.message));
  await page.route("**/api/pax/**", async (route) => {
    const response = await fetch("http://127.0.0.1:17432/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: route.request().postData(),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.goto("http://127.0.0.1:17433");
  await page
    .getByText("Connected", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/pax-vnc-browser-mvp.png" });
  const dimensions = await page.locator("canvas").evaluate((c) => ({
    width: c.width,
    height: c.height,
    hasPixels: c
      .getContext("2d")
      .getImageData(0, 0, c.width, c.height)
      .data.some((n, i) => i % 4 !== 3 && n !== 0),
  }));
  console.log(JSON.stringify(dimensions));
  if (!dimensions.hasPixels) throw Error("Desktop is blank");
  await page.screenshot({ path: "/tmp/pax-vnc-browser-mvp.png" });
  console.log(JSON.stringify({ noVNCRendered: true, ...dimensions }));
} finally {
  await browser.close();
  await server.close();
}
