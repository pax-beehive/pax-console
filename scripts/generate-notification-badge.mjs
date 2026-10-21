import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Next already uses Sharp for image rendering; no extra asset dependency is needed.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const source = await readFile(
  new URL("../public/pax-icon.svg", import.meta.url),
  "utf8",
);

// Android uses the alpha silhouette for the status-bar badge. Keep the original
// mark's geometry, with slightly heavier edges so its arcs survive at 24 dp.
const mask = source
  .replaceAll('fill="#000000"', 'fill="#ffffff"')
  .replaceAll(
    'stroke="none"',
    'stroke="#ffffff" stroke-width="14" stroke-linejoin="round"',
  );
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const rendered = await sharp(Buffer.from(mask))
  .trim()
  .resize(80, 80, { fit: "contain", background: transparent })
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: transparent })
  .png()
  .toBuffer();
const { data, info } = await sharp(rendered).ensureAlpha().raw().toBuffer({
  resolveWithObject: true,
});
assert.equal(info.width, 96);
assert.equal(info.height, 96);
let visible = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const pixel = (y * info.width + x) * 4;
    // Resampling can leave premultiplication rounding in RGB; retain only alpha.
    data[pixel] = data[pixel + 1] = data[pixel + 2] = 255;
    if (data[pixel + 3] === 0) continue;
    visible++;
    assert.ok(x >= 8 && x < 88 && y >= 8 && y < 88, "Transparent margin");
  }
}
assert.ok(visible > 0.15 * 96 * 96 && visible < 0.45 * 96 * 96);
const badge = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toBuffer();

const target = new URL("../public/pax-notification-badge.png", import.meta.url);
if (process.argv.includes("--check")) {
  assert.deepEqual(
    await readFile(target),
    badge,
    "Regenerate the notification badge",
  );
  console.log(
    "Notification badge verified: 96x96, white mark, transparent background.",
  );
} else {
  await writeFile(target, badge);
  console.log("Generated public/pax-notification-badge.png");
}
