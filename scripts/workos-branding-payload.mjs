// Builds a non-secret payload for WorkOS updateAppBranding. Does not publish.
import { readFile } from "node:fs/promises";

const dir = new URL("../branding/workos/", import.meta.url);
const read = (name) => readFile(new URL(name, dir), "utf8");
const settings = JSON.parse(await read("settings.json"));
const html = (await read("panel.html")).trim();
const css = (await read("panel.css")).trim();
const globalCss = (await read("authkit.css")).trim();
process.stdout.write(
  JSON.stringify(
    {
      ...settings,
      authkitSignInCustomHtml: html,
      authkitSignUpCustomHtml: html,
      authkitSignInCustomCss: css,
      authkitSignUpCustomCss: css,
      customCssElements: { authkitGlobal: { css: globalCss, resetCss: false } },
    },
    null,
    2,
  ) + "\n",
);
