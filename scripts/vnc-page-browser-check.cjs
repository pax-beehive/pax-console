// Start the Console locally, then run node scripts/vnc-page-browser-check.cjs.
// All PAX API and RFB traffic is mocked: this does not connect to a real desktop.
// Checks real noVNC wheel handling and viewport layout in desktop and touch-capable
// Chromium contexts; it is not an iOS/Android/Windows physical keyboard test.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const frame = Buffer.alloc(16 + 640 * 360 * 4, 0);
frame[0] = 0;
frame.writeUInt16BE(1, 2);
frame.writeUInt16BE(640, 8);
frame.writeUInt16BE(360, 10);
const init = Buffer.alloc(24);
init.writeUInt16BE(640, 0);
init.writeUInt16BE(360, 2);
init[4] = 32;
init[5] = 24;
init[7] = 1;
init.writeUInt16BE(255, 8);
init.writeUInt16BE(255, 10);
init.writeUInt16BE(255, 12);
init[14] = 16;
init[15] = 8;
const name = Buffer.from("Isolated fixture");
init.writeUInt32BE(name.length, 20);
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      let connection,
        opens = 0,
        wheels = 0;
      await context.route("**/api/pax/**", async (route) => {
        const req = route.request(),
          p = new URL(req.url()).pathname;
        let data = {};
        if (p.endsWith("/me"))
          data = {
            user: { user_id: "u", display_name: "Test user", role: "user" },
          };
        else if (p.endsWith("/daemon/browser")) {
          const body = req.postDataJSON(),
            op = body.operation;
          if (op === "vnc_open") {
            opens++;
            connection = {
              stage: 0,
              input: Buffer.alloc(0),
              output: Buffer.alloc(0),
              framed: false,
            };
            data = {
              browser_control: {
                id: "fixture-" + opens,
                data: Buffer.from("RFB 003.008\n").toString("base64"),
              },
            };
          } else if (op === "vnc_exchange") {
            const c = connection;
            c.input = Buffer.concat([
              c.input,
              Buffer.from(body.payload.data, "base64"),
            ]);
            const queue = (b) => {
              c.output = Buffer.concat([c.output, b]);
            };
            while (c.input.length) {
              if (c.stage === 0) {
                if (c.input.length < 12) break;
                c.input = c.input.subarray(12);
                queue(Buffer.from([1, 1]));
                c.stage = 1;
                continue;
              }
              if (c.stage === 1) {
                c.input = c.input.subarray(1);
                queue(Buffer.alloc(4));
                c.stage = 2;
                continue;
              }
              if (c.stage === 2) {
                c.input = c.input.subarray(1);
                queue(Buffer.concat([init, name]));
                c.stage = 3;
                continue;
              }
              const type = c.input[0];
              let length;
              if (type === 0) length = 20;
              else if (type === 2) {
                if (c.input.length < 4) break;
                length = 4 + c.input.readUInt16BE(2) * 4;
              } else if (type === 3) length = 10;
              else if (type === 4) length = 8;
              else if (type === 5) length = 6;
              else throw Error("Unexpected RFB message " + type);
              if (c.input.length < length) break;
              const packet = c.input.subarray(0, length);
              c.input = c.input.subarray(length);
              if (type === 3 && !c.framed) {
                c.framed = true;
                queue(frame);
              }
              if (type === 5 && packet[1] & 0x18) wheels++;
            }
            const output = c.output.subarray(0, 65536);
            c.output = c.output.subarray(output.length);
            data = { browser_control: { data: output.toString("base64") } };
          } else if (op === "vnc_close") data = { browser_control: {} };
          else if (op === "view" && body.payload.action.type === "screenshot")
            data = {
              browser_control: {
                error: "Fixture preview; no external desktop",
              },
            };
          else data = { browser_control: { ok: true } };
        }
        await route.fulfill({ json: { code: 200, data } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(
        (process.env.VNC_PAGE_CHECK_URL || "http://127.0.0.1:3019") +
          "/nodes/fixture-node/browser",
      );
      const take = page.getByRole("button", { name: "Take control" });
      await take.waitFor();
      assert.equal(opens, 0, "page must start in preview");
      assert.equal(
        await page.getByRole("navigation", { name: "Primary" }).count(),
        0,
      );
      await take.click();
      await page
        .getByText(
          "Connected; click the desktop for shortcuts, or use the text field below",
          { exact: true },
        )
        .waitFor();
      const canvas = page
        .getByRole("region", { name: "Remote Docker desktop" })
        .locator("canvas");
      await canvas.waitFor();
      await page.waitForFunction(
        () => document.querySelector("canvas")?.width === 640,
      );
      const region = page.getByRole("region", {
        name: "Remote Docker desktop",
      });
      const metrics = await region.evaluate((el) => ({
        height: el.clientHeight,
        width: el.clientWidth,
        touch: getComputedStyle(el).touchAction,
        scroll: getComputedStyle(el).overscrollBehavior,
      }));
      assert.ok(metrics.height > 100);
      assert.equal(metrics.touch, "none");
      await canvas.hover();
      await page.mouse.wheel(0, 160);
      await page.waitForFunction(
        () => document.scrollingElement.scrollTop === 0,
      );
      if (!mobile) {
        for (let i = 0; i < 30 && wheels === 0; i++)
          await page.waitForTimeout(50);
        assert.ok(wheels > 0, "wheel must reach VNC");
      }
      await page
        .getByText("Type text with your keyboard", { exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Text for remote desktop" })
        .fill("你好 aA!");
      if (mobile) await page.setViewportSize({ width: 390, height: 420 });
      await page
        .getByRole("button", { name: "Send text", exact: true })
        .scrollIntoViewIfNeeded();
      const bounds = await page
        .getByRole("main", { name: "Docker desktop page" })
        .boundingBox();
      assert.ok(bounds.height <= (mobile ? 420 : 900) + 1);
      assert.equal(
        await page.evaluate(() => document.scrollingElement.scrollTop),
        0,
      );
      await page.screenshot({
        path: mobile
          ? "/tmp/pax-vnc-phone-page.png"
          : "/tmp/pax-vnc-desktop-page.png",
      });
      console.log(
        JSON.stringify({
          mobile,
          opens,
          wheels,
          metrics,
          height: bounds.height,
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
