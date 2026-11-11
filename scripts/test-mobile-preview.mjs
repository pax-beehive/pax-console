// Opt-in UI acceptance against a real node-side mobilecontrol Client harness.
// The Manager identity/node fixture is intercepted only in this isolated browser.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const socketPath = process.env.PAX_MOBILE_HARNESS_SOCKET;
const sessionId = process.env.PAX_MOBILE_SESSION_ID;
const screenshotOnly = process.env.PAX_MOBILE_SCREENSHOT_ONLY === "1";
const testRecording = process.env.PAX_MOBILE_TEST_RECORDING === "1";
const skipInput = screenshotOnly || testRecording;
const execute = promisify(execFile);
if (
  !socketPath ||
  !path.isAbsolute(socketPath) ||
  !/^m-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
    sessionId || "",
  )
)
  throw Error(
    "Provide an absolute private harness socket and the owned running test session ID.",
  );
const origin = process.env.PAX_MOBILE_CONSOLE_ORIGIN || "http://127.0.0.1:3344";
if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))
  throw Error("Only a local acceptance origin is supported.");
const screenshot =
  process.env.PAX_MOBILE_SCREENSHOT || "/private/tmp/pax-mobile-console.png";
const operations = [];
const successful = [];
const statuses = [];
function request(value) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: "/mobile",
        method: "POST",
        timeout: 20000,
        headers: { "content-type": "application/json" },
      },
      (response) => {
        const buffers = [];
        let size = 0;
        response.on("data", (buffer) => {
          if ((size += buffer.length) > 4 * 1024 * 1024)
            req.destroy(Error("Harness response too large"));
          else buffers.push(buffer);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(buffers).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Error("Harness timed out")));
    req.on("error", reject);
    req.end(JSON.stringify(value));
  });
}
const preflight = JSON.parse(
  (await request({ operation: "state", payload: {} })).body,
);
const owned = preflight.data?.mobile_control?.sessions?.find(
  (value) => value.id === sessionId,
);
assert.ok(
  owned?.state === "running",
  "The explicitly selected SDK test phone must be running.",
);
if (!skipInput)
  assert.equal(
    owned.takeover,
    false,
    "Do not take over a phone already held by another test/operator.",
  );

const browser = await chromium.launch({
  executablePath:
    process.env.PAX_MOBILE_CHROME ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  chromiumSandbox: true,
});
let tookControl = false;
let recordingId;
let recordingCompleted = false;
let recordingEvidence;
try {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 1600 },
    colorScheme: "dark",
    acceptDownloads: true,
  });
  const node = {
    node_id: "mobile-acceptance",
    name: "Local Android acceptance",
    hostname: "SDK test host",
    os: "darwin",
    arch: "amd64",
    online: true,
  };
  await context.route("**/api/pax/**", async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith("/daemon/mobile")) {
      const value = route.request().postDataJSON();
      operations.push(value.operation);
      const result = await request(value);
      const parsed = JSON.parse(result.body);
      statuses.push({
        operation: value.operation,
        status: result.status,
        code: parsed.code,
        hasControl: parsed.data?.mobile_control != null,
        errorCode: parsed.data?.error?.code ?? parsed.error?.code ?? null,
      });
      if (
        result.status === 200 &&
        parsed.data?.mobile_control != null &&
        !parsed.data?.error
      )
        successful.push(value.operation);
      return route.fulfill({
        status: result.status,
        contentType: "application/json",
        body: result.body,
      });
    }
    if (url.pathname.endsWith("/me"))
      body = {
        user: {
          user_id: "mobile-acceptance-user",
          display_name: "Local acceptance",
          is_admin: false,
        },
      };
    else if (url.pathname.endsWith("/nodes/mobile-acceptance")) body = node;
    else if (url.pathname.endsWith("/nodes")) body = { nodes: [node] };
    else if (url.pathname.includes("/daemon/"))
      body = {
        status: { phase: "running" },
        harnesses: { items: [] },
        agent_connections: { items: [] },
      };
    else body = { items: [], agents: [], sessions: [] };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data: body }),
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(origin + "/nodes/mobile-acceptance", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page
    .getByRole("button", { name: "Open Android control" })
    .click({ timeout: 120000 });
  const panel = page.getByRole("region", { name: "Android control" });
  await panel
    .getByRole("combobox", { name: "Android phone" })
    .selectOption(sessionId);
  const image = panel.getByRole("img", { name: "Android phone screenshot" });
  await image.waitFor({ timeout: 30000 });
  await image.evaluate(async (image) => {
    await image.decode();
  });
  const dimensions = await image.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  assert.ok(dimensions.width > 100 && dimensions.height > 100);
  if (!skipInput) {
    await panel
      .getByRole("button", { name: "Take control", exact: true })
      .click();
    tookControl = true;
    const back = panel.getByRole("button", { name: "Back", exact: true });
    await back.click({ timeout: 30000 });
    const releaseResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/daemon/mobile") &&
        response.request().postDataJSON()?.operation === "release",
      { timeout: 30000 },
    );
    await panel
      .getByRole("button", { name: "Release control", exact: true })
      .click();
    await releaseResponse;
    if (successful.includes("release")) tookControl = false;
    await panel
      .getByText("Human control", { exact: true })
      .waitFor({ state: "hidden", timeout: 30000 });
  }
  if (testRecording) {
    await panel
      .getByRole("combobox", { name: "Android recording type" })
      .selectOption("audio");
    await panel
      .getByRole("spinbutton", { name: "Recording duration in seconds" })
      .fill("5");
    const started = page.waitForResponse(
      (response) =>
        response.url().endsWith("/daemon/mobile") &&
        response.request().postDataJSON()?.operation === "recording_start",
      { timeout: 30000 },
    );
    await panel
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    const response = await started;
    assert.equal(
      response.status(),
      200,
      "Recording start must succeed; never retry an ambiguous start.",
    );
    const record = (await response.json()).data?.mobile_control;
    assert.equal(record?.kind, "audio");
    assert.equal(record?.durationSec, 5);
    assert.match(
      record?.id || "",
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
    recordingId = record.id;
    const row = panel.getByRole("article", {
      name: `Android recording ${recordingId}`,
      exact: true,
    });
    const finalState = row.getByText(/^(completed|failed|interrupted)$/);
    await finalState.waitFor({ timeout: 60000 });
    assert.equal(
      await finalState.textContent(),
      "completed",
      "The SDK recording must finalize successfully.",
    );
    recordingCompleted = true;
    const downloaded = page.waitForEvent("download", { timeout: 60000 });
    await row
      .getByRole("button", { name: "Download audio", exact: true })
      .click();
    const download = await downloaded;
    const filename = path.join(
      "/private/tmp",
      `pax-mobile-audio-${recordingId}.opus`,
    );
    await download.saveAs(filename);
    assert.equal(await download.failure(), null);
    const probe = await execute(
      process.env.PAX_MOBILE_FFPROBE || "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels",
        "-of",
        "json",
        filename,
      ],
      { timeout: 20000, maxBuffer: 65536 },
    );
    const audio = JSON.parse(probe.stdout).streams?.[0];
    assert.ok(
      audio?.codec_name && Number(audio.sample_rate) > 0 && audio.channels > 0,
      "Downloaded recording must contain real audio.",
    );
    const decoded = await execute(
      process.env.PAX_MOBILE_FFMPEG || "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        filename,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { timeout: 20000, encoding: "buffer", maxBuffer: 4 * 1024 * 1024 },
    );
    const pcm = decoded.stdout;
    let sum = 0;
    let peak = 0;
    for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
      const sample = pcm.readInt16LE(offset);
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
    }
    const samples = Math.floor(pcm.length / 2);
    const rms = Math.sqrt(sum / Math.max(1, samples));
    recordingEvidence = {
      id: recordingId,
      filename,
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: audio.channels,
      samples,
      peak,
      rms: Math.round(rms),
      meanVolumeDbFS: rms
        ? Math.round(20 * Math.log10(rms / 32768) * 100) / 100
        : null,
      readChunks: successful.filter(
        (operation) => operation === "recording_read",
      ).length,
    };
    assert.ok(
      samples >= 48000 && peak > 256 && rms > 32,
      `Downloaded SDK tone recording did not meet the PCM threshold: ${JSON.stringify(recordingEvidence)}`,
    );
  }
  await image.waitFor();
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: screenshot });
  const required = skipInput
    ? ["state", "screenshot"]
    : ["screenshot", "takeover", "key", "release"];
  if (testRecording)
    required.push("recording_start", "recording_list", "recording_read");
  assert.ok(
    required.every((operation) => successful.includes(operation)),
    `Required mobile operations did not all succeed: ${JSON.stringify({ operations, successful, statuses })}`,
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    JSON.stringify({
      passed: true,
      screenshotOnly,
      testRecording,
      recordingEvidence,
      dimensions,
      operations: [...new Set(operations)],
      successful: [...new Set(successful)],
      statuses,
      screenshot,
      scope:
        "Real Console page and paxd mobilecontrol Client to real SDK runtime; Manager identity/node fixtures intercepted in test browser.",
    }) + "\n",
  );
} finally {
  if (recordingId && !recordingCompleted)
    await request({
      operation: "recording_stop",
      payload: { sessionId, recordingId },
    }).catch(() => {});
  if (tookControl)
    await request({ operation: "release", payload: { sessionId } }).catch(
      () => {},
    );
  await browser.close();
}
