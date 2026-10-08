import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PAXL_E2E_BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
    extraHTTPHeaders: { "X-User-Email": "paxl-e2e@example.com" },
  });
  page.on("pageerror", (error) =>
    console.error("Browser page error:", error.message),
  );
  await page.goto(
    `${process.env.PAXL_E2E_CONSOLE}/nodes/${process.env.PAXL_E2E_NODE}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  await page
    .getByText("Advanced device settings", { exact: true })
    .click({ timeout: 90000 });
  for (const component of ["cli", "acp"]) {
    for (const harness of ["claude-code", "codex", "pi"]) {
      const form = page.getByRole("region", { name: "Harness upgrades" });
      await form.getByLabel("Harness", { exact: true }).selectOption(harness);
      await form
        .getByLabel("Component", { exact: true })
        .selectOption(component);
      if (component === "acp") {
        await form
          .getByLabel("ACP connection", { exact: true })
          .selectOption(`fixture-${harness}`, { timeout: 15000 });
      }
      await form.getByLabel("Target version").fill("1.2.3");
      await form
        .getByRole("button", {
          name: "Upgrade selected component",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Install update", exact: true })
        .click();
      const message = `${harness === "claude-code" ? "Claude" : harness === "pi" ? "Pi" : "Codex"} ${component === "cli" ? "CLI" : "ACP adapter"} 1.2.3 verified`;
      try {
        await page
          .getByText(message, { exact: true })
          .waitFor({ timeout: 80000 });
      } catch (error) {
        console.error(await form.innerText());
        throw error;
      }
      await page.reload();
      await page
        .getByText("Advanced device settings", { exact: true })
        .click({ timeout: 60000 })
        .catch(async (error) => {
          console.error(await page.locator("body").innerText());
          throw error;
        });
      await page
        .getByText(message, { exact: true })
        .waitFor({ timeout: 15000 });
      console.log(`${message}; command recovered after reload.`);
    }
  }
  for (const [harness, component] of [
    ["codex", "acp"],
    ["codex", "cli"],
    ["pi", "acp"],
    ["pi", "cli"],
  ]) {
    const form = page.getByRole("region", { name: "Harness upgrades" });
    await form.getByLabel("Harness", { exact: true }).selectOption(harness);
    await form.getByLabel("Component", { exact: true }).selectOption(component);
    if (component === "acp") {
      await form
        .getByLabel("ACP connection", { exact: true })
        .selectOption(`fixture-${harness}`);
    }
    await form.getByLabel("Target version").fill("1.2.4");
    await form
      .getByRole("button", { name: "Upgrade selected component", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Install update", exact: true })
      .click();
    await form
      .getByRole("alert")
      .filter({ hasText: "previous installation and processes restored" })
      .waitFor({ timeout: 80000 });
    console.log(
      `${harness} ${component} version mismatch rejected; previous installation and processes restored.`,
    );
  }
} finally {
  await browser.close();
}
