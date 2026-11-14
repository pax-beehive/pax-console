import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Read-only browser regression: all API responses use fictional local fixtures.
const origin = process.env.PAX_I18N_PREVIEW_URL ?? "http://127.0.0.1:3388";
const output =
  process.env.PAX_I18N_SCREENSHOTS ?? "/tmp/pax-console-chinese-ui";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, locale: "zh-CN" });
    await context.route("**/api/region-config", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await context.route("**/api/pax/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {
        nodes: [],
        agents: [],
        projects: [],
        targets: [],
        api_keys: [],
        grants: [],
        approvals: [],
        sessions: [],
        status: "ok",
        messages: [],
        items: [],
      };
      if (path.endsWith("/me"))
        data = {
          user: {
            user_id: "i18n-demo",
            email: "alex@example.invalid",
            role: "user",
          },
        };
      else if (path.endsWith("/features"))
        data = { revision: 1, features: { voice_input: true } };
      else if (path.endsWith("/notifications/config"))
        data = {
          enabled: false,
          test_enabled: false,
          turn_completion_enabled: false,
          approval_required_enabled: false,
        };
      else if (path.endsWith("/receivers"))
        data = {
          regions: [{ region: "local", available: true, receivers: [] }],
        };
      else if (path.endsWith("/secretary"))
        data = {
          enabled: false,
          revision: 0,
          state: "disabled",
          pending_count: 0,
          agent_available: false,
        };
      else if (path.endsWith("/secretary/progress"))
        data = {
          as_of: "2026-11-13T00:00:00Z",
          counts: {
            total_sessions: 0,
            completed_sessions: 0,
            partial_sessions: 0,
            unstarted_sessions: 0,
            total_messages: 0,
            completed_messages: 0,
            pending_messages: 0,
            total_turns: 0,
            completed_turns: 0,
            pending_turns: 0,
            ungrouped_messages: 0,
          },
          sessions: [],
        };
      return route.fulfill({ json: { code: 200, data } });
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(180_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/settings/voice");
    const userMenu = page.getByRole("button", {
      name: /^(User menu|用户菜单)$/,
    });
    const english = page.getByRole("menuitemradio", {
      name: "English",
      exact: true,
    });
    const chinese = page.getByRole("menuitemradio", {
      name: "简体中文",
      exact: true,
    });
    await userMenu.waitFor();
    await page.getByRole("radio", { name: /^保持音乐播放/ }).waitFor();
    assert.equal(
      await page
        .locator("header")
        .getByRole("combobox", { name: "Language / 语言" })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator("header")
        .getByRole("button", { name: /Language|语言/ })
        .count(),
      0,
    );
    assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    await page.getByRole("radio", { name: /^耳机麦克风/ }).click();
    await userMenu.click();
    await chinese.waitFor();
    assert.equal(await chinese.getAttribute("aria-checked"), "true");
    assert.equal(await english.getAttribute("aria-checked"), "false");
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.screenshot({
      path: `${output}/${viewport.width}-user-menu-zh.png`,
    });
    await english.click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await page.getByRole("radio", { name: /^Headset microphone/ }).waitFor();
    assert.equal(
      await page
        .getByRole("radio", { name: /^Headset microphone/ })
        .getAttribute("aria-checked"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pax-console-locale")),
      "en",
    );
    await page.reload();
    await page.getByRole("radio", { name: /^Headset microphone/ }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(
      await page
        .getByRole("radio", { name: /^Headset microphone/ })
        .getAttribute("aria-checked"),
      "true",
    );
    await userMenu.click();
    await english.waitFor();
    assert.equal(await english.getAttribute("aria-checked"), "true");
    assert.equal(await chinese.getAttribute("aria-checked"), "false");
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.screenshot({
      path: `${output}/${viewport.width}-user-menu-en.png`,
    });
    await chinese.click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await page.getByRole("radio", { name: /^耳机麦克风/ }).waitFor();
    assert.equal(
      await page
        .getByRole("radio", { name: /^耳机麦克风/ })
        .getAttribute("aria-checked"),
      "true",
    );
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.screenshot({ path: `${output}/${viewport.width}-voice.png` });
    for (const [path, heading] of [
      ["/settings/devices", "我的设备"],
      ["/settings/projects", "项目"],
      ["/settings/advanced/encryption", "加密会话"],
    ]) {
      await page.goto(origin + path);
      await page
        .getByRole("heading", { name: heading, exact: true })
        .filter({ visible: true })
        .first()
        .waitFor()
        .catch(async (error) => {
          console.log({
            path,
            headings: await page.getByRole("heading").allTextContents(),
          });
          await page.screenshot({ path: `${output}/failure.png` });
          throw error;
        });
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("pax-console-locale")),
        "zh-CN",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        `${path} overflow at ${viewport.width}`,
      );
      await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
      await page.screenshot({
        path: `${output}/${viewport.width}-${path.split("/").at(-1)}.png`,
      });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    `Chinese/English browser checks passed at desktop/mobile sizes. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
