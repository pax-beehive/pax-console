import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Fictional contract fixtures check the real Console UI; this is not a live
// Manager or gateway integration test. No real configuration is written.
const origin = new URL(
  process.env.PAX_CONFIG_CONSOLE_URL ?? "http://localhost:3128",
);
assert(["localhost", "127.0.0.1"].includes(origin.hostname));
const output =
  process.env.PAX_CONFIG_SCREENSHOTS ??
  "/private/tmp/pax-config-admin-screenshots";
await mkdir(output, { recursive: true });
const base = {
  kind: "setting",
  group: "search",
  description: "",
  type: "string",
  options: null,
  secret: false,
  has_value: true,
  source: "db",
  env_var: "",
  default_display: null,
  apply: "live",
  pending_restart: false,
  testable: false,
  version: 3,
  updated_at: null,
  updated_by: null,
};
const labels = [
  "Secretary",
  "Notifications",
  "Collaboration",
  "Knowledge capsules",
  "Browser control",
  "Android control",
  "Voice input",
];
const keys = [
  "secretary",
  "notifications",
  "collaboration",
  "knowledge_capsules",
  "browser_control",
  "android_control",
  "voice_input",
];
const fixture = (region) => ({
  region,
  revision: 42,
  vault_configured: true,
  health: {
    last_refresh_at: "2026-11-13T20:00:00Z",
    refresh_failures: 0,
    degraded: false,
  },
  entries: [
    ...keys.map((key, i) => ({
      ...base,
      key: `feature.${key}`,
      kind: "feature",
      group: "features",
      label: labels[i],
      type: "feature",
      value: {
        stage: i === 2 ? "beta" : "admin",
        beta_emails:
          i === 2 ? ["alex@example.invalid", "beta@example.invalid"] : [],
      },
      display: i === 2 ? "beta" : "admin",
      source: i === 2 ? "db" : "default",
      version: i === 2 ? 3 : 0,
    })),
    {
      ...base,
      key: "search.url",
      label: "Search URL",
      type: "url",
      value: `https://${region}-search.example.invalid`,
      display: `https://${region}-search.example.invalid`,
      env_var: "SEARCH_URL",
      testable: true,
    },
    {
      ...base,
      key: "search.api_key",
      label: "Search API key",
      secret: true,
      value: null,
      display: "sk-…a3f2",
      source: "env",
      env_var: "SEARCH_API_KEY",
      testable: true,
      version: 0,
    },
    {
      ...base,
      key: "search.index",
      label: "Search index",
      value: "pax",
      display: "pax",
      source: "default",
      version: 0,
    },
    {
      ...base,
      key: "voice.provider",
      group: "voice",
      label: "Voice provider",
      type: "enum",
      options: ["openai", "qwen", "soniox", "seedasr"],
      value: "qwen",
      display: "qwen",
      testable: true,
    },
  ],
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PAX_BROWSER_TEST_EXECUTABLE || undefined,
});
const shots = [];
try {
  for (const locale of ["en", "zh-CN"])
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1080 },
        locale,
      });
      await context.addInitScript(
        (locale) => localStorage.setItem("pax-console-locale", locale),
        locale,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(45_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const snapshots = { us: fixture("us"), hk: fixture("hk") };
      let writes = 0;
      await page.route("**/api/region-config", (route) =>
        route.fulfill({ json: { enabled: false } }),
      );
      await page.route("**/api/pax/**", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const ok = (data) =>
          route.fulfill({ json: { code: 200, data, message: "ok" } });
        if (url.pathname.endsWith("/me"))
          return ok({
            user: {
              user_id: "fixture-admin",
              email: "admin@example.invalid",
              role: "admin",
              is_admin: true,
            },
          });
        if (url.pathname.endsWith("/features"))
          return ok({
            revision: 42,
            features: Object.fromEntries(keys.map((key) => [key, true])),
          });
        if (url.pathname.includes("/admin/config")) {
          const region = url.searchParams.get("region");
          assert(["us", "hk"].includes(region));
          if (url.pathname.endsWith("/audit"))
            return ok({
              items: [
                {
                  id: 101,
                  key: "search.url",
                  action: "set",
                  old_display: "https://old-search.example.invalid",
                  new_display: `https://${region}-search.example.invalid`,
                  version: 3,
                  actor: "admin@example.invalid",
                  reason: "Regional search rollout",
                  created_at: "2026-11-13T20:00:00Z",
                  revertible: true,
                },
              ],
              next_cursor: null,
            });
          if (url.pathname.endsWith("/test"))
            return ok({
              ok: true,
              latency_ms: 180,
              message: "fixture connection passed",
            });
          if (req.method() === "PUT") {
            writes++;
            if (region === "hk")
              return route.fulfill({
                status: 409,
                json: {
                  code: 409,
                  data: { error: "version_conflict", version: 4 },
                  message: "version_conflict",
                },
              });
            const key = decodeURIComponent(url.pathname.split("/").at(-1));
            const entry = snapshots[region].entries.find(
              (entry) => entry.key === key,
            );
            Object.assign(entry, {
              value: req.postDataJSON().value,
              version: entry.version + 1,
              source: "db",
            });
            return ok(entry);
          }
          return ok(snapshots[region]);
        }
        if (url.pathname.endsWith("/customer-visit"))
          return ok({ recorded: true });
        return ok({});
      });
      const zh = locale === "zh-CN";
      const t = (en, cn) => (zh ? cn : en);
      const shot = async (name) => {
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `No horizontal overflow ${locale}/${width}/${name}`,
        );
        const filename = `config-${locale}-${width}-${name}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        shots.push(filename);
      };
      await page.goto(new URL("/admin/config", origin).href);
      await page
        .getByRole("button", { name: t("Edit Collaboration", "编辑协作") })
        .waitFor();
      await shot("features");
      await page
        .getByRole("button", { name: t("Edit Collaboration", "编辑协作") })
        .click();
      const drawer = page.getByRole("dialog");
      await drawer
        .getByLabel(t("Reason", "修改原因"), { exact: true })
        .fill(
          t(
            "Open collaboration for the regional pilot group.",
            "为区域试用组开放协作功能。",
          ),
        );
      await drawer.getByRole("checkbox").check();
      await drawer
        .getByRole("button", { name: t("Save", "保存"), exact: true })
        .click();
      await drawer
        .getByText(t("Conflict · not saved", "版本冲突 · 未保存"), {
          exact: true,
        })
        .waitFor();
      assert.equal(writes, 2, "Sequential two-region save");
      await shot("editor-partial-conflict");
      await drawer
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .click();
      await page
        .getByRole("tab", { name: t("Service settings", "服务配置") })
        .click();
      await shot("settings");
      await page
        .getByRole("tab", { name: t("Change history", "修改记录") })
        .click();
      await page
        .getByRole("button", { name: t("Revert", "回滚"), exact: true })
        .waitFor();
      await shot("audit");
      assert.deepEqual(errors, [], "No browser runtime errors");
      await context.close();
    }
  await writeFile(
    path.join(output, "verification.json"),
    JSON.stringify({ fixtures: true, pass: true, screenshots: shots }, null, 2),
  );
  process.stdout.write(
    JSON.stringify({ pass: true, fixtures: true, output, screenshots: shots }) +
      "\n",
  );
} finally {
  await browser.close();
}
