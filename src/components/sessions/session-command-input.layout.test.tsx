/* @vitest-environment jsdom */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkstreamItemCard } from "./session-event-cards";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { chromium } from "playwright";
import tailwind from "@tailwindcss/postcss";
import { SessionCommandInput } from "./session-command-input";

// Opt-in real layout checks: PAX_BROWSER_TESTS=1 node node_modules/vitest/vitest.mjs run ...
// Uses Chromium touch emulation, not a substitute for physical iOS verification.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
  "postcss",
);
afterEach(cleanup);

it.skipIf(!process.env.PAX_BROWSER_TESTS)(
  "wraps commands without overflow and limits the 16px form baseline to phones",
  async () => {
    const longText = "unbroken-command-or-url-".repeat(20);
    function Fixture() {
      const [value, setValue] = useState("/");
      return (
        <SessionCommandInput
          value={value}
          onValueChange={setValue}
          className="w-full text-base sm:text-sm"
          commands={Array.from({ length: 12 }, (_, index) => ({
            name: `${index}${longText}`,
            description: longText,
            input: { hint: longText },
          }))}
        />
      );
    }
    const { container } = render(<Fixture />);
    fireEvent.focus(screen.getByRole("textbox"));
    const messages = renderToStaticMarkup(
      <>
        {(["user_message", "agent_message"] as const).map((type) => (
          <WorkstreamItemCard
            key={type}
            item={{
              type: "event",
              id: type,
              event: {
                type,
                id: type,
                sessionId: "layout",
                content: "手机端聊天正文",
                createdAt: "2026-09-08T00:00:00Z",
              },
            }}
            permissionDecision={{
              decisions: {},
              pending: false,
              error: null,
              onDecision: () => {},
            }}
          />
        ))}
      </>,
    );
    const cssPath = `${process.cwd()}/src/app/globals.css`;
    const css = await postcss([tailwind()]).process(
      await readFile(cssPath, "utf8"),
      {
        from: cssPath,
      },
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PAX_TEST_CHROMIUM_PATH || undefined,
    });
    try {
      for (const width of [320, 390, 768, 1280]) {
        const touch = true;
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          hasTouch: touch,
        });
        await page.setContent(
          `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><main style="width:100%;padding:16px;padding-top:400px">${messages}${container.innerHTML}<input class="text-xs"><select><option>Choice</option></select></main>`,
        );
        for (const paragraph of await page.locator("article p").all()) {
          expect(
            await paragraph.evaluate((el) => ({
              fontSize: getComputedStyle(el).fontSize,
              lineHeight: getComputedStyle(el).lineHeight,
            })),
          ).toEqual(
            width < 640
              ? { fontSize: "16px", lineHeight: "24px" }
              : { fontSize: "14px", lineHeight: "20px" },
          );
        }
        const list = page.getByRole("listbox");
        expect(
          await list.evaluate((el) => ({
            x: getComputedStyle(el).overflowX,
            fits: el.scrollWidth <= el.clientWidth,
            scrollsVertically: el.scrollHeight > el.clientHeight,
          })),
        ).toEqual({ x: "hidden", fits: true, scrollsVertically: true });
        for (const element of await page
          .locator("textarea,input,select")
          .all()) {
          await element.focus();
          const expectedSize =
            width < 640
              ? 16
              : (await element.evaluate((el) => el.tagName)) === "INPUT"
                ? 12
                : 14;
          expect(
            await element.evaluate((el) =>
              parseFloat(getComputedStyle(el).fontSize),
            ),
          ).toBe(expectedSize);
          await element.blur();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  },
  60_000,
);
