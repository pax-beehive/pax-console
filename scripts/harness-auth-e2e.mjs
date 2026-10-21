import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PAXL_E2E_BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
    extraHTTPHeaders: { "X-User-Email": "paxl-e2e@example.com" },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `${process.env.PAXL_E2E_CONSOLE}/nodes/${process.env.PAXL_E2E_NODE}`;
  async function open() {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page
      .getByText("Advanced device settings", { exact: true })
      .click({ timeout: 90000 });
  }
  await open();
  let form = page.getByRole("region", { name: "Harness authentication" });
  await form.getByLabel("Authentication harness").selectOption("claude");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await form.getByLabel("Authentication input").waitFor({ timeout: 30000 });
  await form
    .getByRole("link", { name: "Open authorization page" })
    .waitFor({ timeout: 15000 });
  const disconnected = await fetch(
    process.env.PAXL_E2E_MANAGER + "/_fixture/disconnect",
    { method: "POST" },
  );
  if (disconnected.status !== 204)
    throw Error("Could not disconnect fixture control socket");
  await open();
  form = page.getByRole("region", { name: "Harness authentication" });
  await form.getByLabel("Authentication input").waitFor({ timeout: 20000 });
  await form.getByLabel("Authentication input").fill("fixture-private-code");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form
    .getByText("Authentication state: succeeded", { exact: true })
    .waitFor({ timeout: 30000 });
  if ((await form.innerText()).includes("fixture-private-code"))
    throw Error("Authorization code leaked into result");
  await form.getByRole("button", { name: "Start again", exact: true }).click();
  await form.getByLabel("Authentication harness").selectOption("pi");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await form.getByLabel("Authentication choice").waitFor({ timeout: 20000 });
  await form.getByLabel("Authentication choice").selectOption("example");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.getByLabel("Authentication choice").selectOption("api-key");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.getByLabel("Authentication input").waitFor({ timeout: 20000 });
  await form.getByLabel("Authentication input").fill("fixture-api-key");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form
    .getByText("Authentication state: succeeded", { exact: true })
    .waitFor({ timeout: 30000 });
  if ((await form.innerText()).includes("fixture-api-key"))
    throw Error("API key leaked into result");
  const saved = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("harness-auth-v1:"))
      .map(([, value]) => value)
      .join("\n"),
  );
  if (/fixture-private-code|fixture-api-key|example.invalid/.test(saved))
    throw Error("Sensitive auth data persisted in browser storage");
  await form.getByRole("button", { name: "Start again", exact: true }).click();
  await form.getByLabel("Authentication harness").selectOption("codex");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await form
    .getByRole("link", { name: "Open authorization page" })
    .waitFor({ timeout: 20000 });
  await form
    .getByRole("button", { name: "Cancel sign-in", exact: true })
    .click();
  await form
    .getByText("Authentication state: cancelled", { exact: true })
    .waitFor({ timeout: 20000 });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Browser -> Manager -> paxd -> paxl -> native CLI/SDK passed: control socket reconnect, reload, authorization-code input, dynamic provider/method prompts, masked API key, cancellation and secret non-persistence.",
  );
} finally {
  await browser.close();
}
