import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PAXL_E2E_BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
    extraHTTPHeaders: { "X-User-Email": "paxl-e2e@example.com" },
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(msg.text());
  });
  await page.goto(
    `${process.env.PAXL_E2E_CONSOLE}/nodes/${process.env.PAXL_E2E_NODE}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  await page
    .getByText("Advanced device settings", { exact: true })
    .click({ timeout: 90000 });
  await page.getByRole("button", { name: "Upgrade paxl", exact: true }).click();
  await page
    .getByRole("button", { name: "Install paxl update", exact: true })
    .click();
  await page
    .getByText("paxl 1.2.3 verified", { exact: true })
    .waitFor({ timeout: 45000 });
  await page.reload();
  await page.getByText("Advanced device settings", { exact: true }).click();
  await page
    .getByText("paxl 1.2.3 verified", { exact: true })
    .waitFor({ timeout: 15000 });
  console.log(
    "Browser-triggered paxl upgrade verified; command recovered after reload.",
  );
} finally {
  await browser.close();
}
