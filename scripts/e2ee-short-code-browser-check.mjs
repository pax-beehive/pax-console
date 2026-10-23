// Run against a local Console production build. Only fixture API traffic is
// used; two isolated browser contexts exercise real Worker/WASM and key stores.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.E2EE_CHECK_URL || "http://127.0.0.1:3028";
const rootKey = Buffer.alloc(32, 7).toString("base64");
async function readRoot(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("pax-console-e2ee");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("root-keys")
            .objectStore("root-keys")
            .get("a1");
          read.onsuccess = () => {
            db.close();
            resolve(read.result?.encodedKey);
          };
        };
      }),
  );
}
async function grantFixture(page) {
  await page.evaluate(
    (value) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("pax-console-e2ee");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("root-keys", "readwrite");
          tx.objectStore("root-keys").put({
            agentId: "a1",
            encodedKey: value,
            updatedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    rootKey,
  );
}
async function noHorizontalScroll(page) {
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter(
        (el) =>
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + 1 &&
          ["auto", "scroll"].includes(getComputedStyle(el).overflowX),
      )
      .map((el) => ({
        tag: el.tagName,
        className: el.className,
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
      })),
  );
  assert.deepEqual(overflowing, [], "nested horizontal scrolling");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "horizontal overflow",
  );
}
async function scenario(browser, recipientWidth, approverWidth) {
  const requests = new Map(),
    attempts = new Map(),
    packages = new Map();
  const mutations = [],
    errors = [];
  const contexts = await Promise.all(
    [recipientWidth, approverWidth].map((width) =>
      browser.newContext({ viewport: { width, height: 850 } }),
    ),
  );
  async function routeAPI(route) {
    const req = route.request(),
      p = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    const cap = req.headers()["x-pax-pairing-capability"];
    if (body) mutations.push(body);
    let data = {},
      status = 200;
    const pairing = p.match(/\/pairings\/([^/]+)(.*)$/);
    if (p.endsWith("/me"))
      data = {
        user: { user_id: "u1", display_name: "Test user", role: "user" },
      };
    else if (p.endsWith("/nodes"))
      data = {
        nodes: [{ node_id: "n1", name: "Office computer", online: true }],
      };
    else if (p.endsWith("/agents"))
      data = {
        agents: [
          {
            agent_id: "a1",
            node_id: "n1",
            name: "Agent with a deliberately long name to verify mobile layout",
            online: true,
          },
        ],
      };
    else if (p.endsWith("/sessions")) data = { sessions: [] };
    else if (p.endsWith("/projects")) data = { projects: [] };
    else if (p.endsWith("/pairings")) {
      if (body) {
        const now = new Date();
        data = {
          ...body,
          agent_id: "a1",
          node_id: "n1",
          created_at: now.toISOString(),
          server_time: now.toISOString(),
          expires_at: new Date(+now + 600_000).toISOString(),
          status: "pending",
        };
        requests.set(data.pairing_id, data);
      } else
        data = [...requests.values()]
          .filter((r) => r.status === "pending")
          .map((r) => ({ ...r, server_time: new Date().toISOString() }));
    } else if (pairing) {
      const r = requests.get(pairing[1]),
        suffix = pairing[2];
      if (!r) status = 404;
      else if (!suffix) data = { ...r, server_time: new Date().toISOString() };
      else if (suffix === "/attempts") {
        if (body) {
          assert.match(body.client_hello, /^[A-Za-z0-9_-]+$/);
          data = {
            ...body,
            pairing_id: r.pairing_id,
            stage: 0,
            created_at: new Date().toISOString(),
            expires_at: new Date(
              Date.parse(r.created_at) + (body.generation + 1) * 60000 + 30000,
            ).toISOString(),
            cap,
          };
          attempts.set(data.attempt_id, data);
        } else {
          assert.equal(cap, r.recipient_capability);
          data = [...attempts.values()].filter(
            (a) => a.pairing_id === r.pairing_id && a.stage < 3,
          );
        }
      } else if (suffix.startsWith("/attempts/")) {
        const a = attempts.get(suffix.split("/")[2]);
        assert(a);
        if (body) {
          assert.equal(cap, body.stage === 2 ? a.cap : r.recipient_capability);
          a.stage = body.stage;
          a[
            { 1: "recipient_answer", 2: "client_finish", 3: "secret_payload" }[
              body.stage
            ]
          ] = body.payload;
          if (body.stage === 3)
            a.confirmation_expires_at = new Date(
              Date.now() + 30000,
            ).toISOString();
        } else assert.equal(cap, a.cap);
        data = a;
      } else if (suffix === "/package") {
        const a = attempts.get(body.attempt_id);
        assert.equal(a.stage, 3);
        assert.equal(cap, a.cap);
        assert(Date.parse(a.confirmation_expires_at) > Date.now());
        data = {
          ...body,
          pairing_id: r.pairing_id,
          agent_id: r.agent_id,
          node_id: r.node_id,
          device_id: r.device_id,
          key_epoch: r.key_epoch,
          recipient_public_key: r.recipient_public_key,
          created_at: new Date().toISOString(),
        };
        packages.set(r.device_id, data);
        r.status = "approved";
        a.stage = 4;
      } else if (suffix === "/end") {
        r.status = body.reason;
        data = { status: body.reason };
      }
    } else if (p.includes("/key-packages/")) {
      data = packages.get(p.split("/").at(-1));
      if (!data) status = 404;
    }
    await route.fulfill({
      status,
      json: {
        code: status,
        data,
        ...(status === 404 ? { message: "Not found" } : {}),
      },
    });
  }
  for (const context of contexts)
    await context.route("**/api/pax/**", routeAPI);
  let [recipient, approver] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  for (const page of [recipient, approver])
    page.on("pageerror", (error) => errors.push(error.message));
  await recipient.goto(base + "/settings/advanced/encryption");
  await recipient
    .getByRole("heading", { name: "Encrypted session access", exact: true })
    .waitFor();
  assert(
    await recipient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "encryption settings horizontal overflow",
  );
  await noHorizontalScroll(recipient);
  await recipient
    .getByText("Advanced: manually manage root key", { exact: true })
    .click();
  await noHorizontalScroll(recipient);
  const path = base + "/e2ee/pairing?agentId=a1";
  await Promise.all([recipient.goto(path), approver.goto(path)]);
  await approver
    .getByRole("button", { name: "Authorize this device", exact: true })
    .waitFor();
  await grantFixture(approver);
  await approver.reload();
  await approver.getByLabel("Code from the new device").waitFor();
  await recipient
    .getByRole("button", { name: "Authorize this device", exact: true })
    .click();
  await recipient
    .getByRole("button", { name: "Show code", exact: true })
    .waitFor();
  await recipient
    .getByRole("button", { name: "Show code", exact: true })
    .click();
  const code = (await recipient.locator("pre").innerText()).replace(/\s/g, "");
  assert.match(code, /^\d{8}$/);
  // Refresh retains the request, current short code, and response capability.
  await recipient.reload();
  await recipient
    .getByRole("button", { name: "Show code", exact: true })
    .click();
  assert.equal(
    (await recipient.locator("pre").innerText()).replace(/\s/g, ""),
    code,
  );
  // A second tab may show the same request; closing the first transfers its
  // browser lock without generating another request or losing recovery state.
  const secondTab = await contexts[0].newPage();
  secondTab.on("pageerror", (error) => errors.push(error.message));
  await secondTab.goto(path);
  await secondTab
    .getByRole("button", { name: "Show code", exact: true })
    .click();
  assert.equal(
    (await secondTab.locator("pre").innerText()).replace(/\s/g, ""),
    code,
  );
  await recipient.close();
  recipient = secondTab;
  assert.equal(requests.size, 1);
  for (const page of [recipient, approver])
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "horizontal overflow",
    );
  await noHorizontalScroll(recipient);
  await noHorizontalScroll(approver);
  const wrong = code === "00000000" ? "11111111" : "00000000";
  await approver.getByLabel("Code from the new device").fill(wrong);
  await approver.getByText(/Code not accepted/).waitFor({ timeout: 30000 });
  assert.equal(packages.size, 0);
  await approver.getByLabel("Code from the new device").fill(code);
  await approver
    .getByRole("button", { name: "Authorize device", exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(packages.size, 0, "Matching must not deliver the root key");
  await approver
    .getByRole("button", { name: "Authorize device", exact: true })
    .click();
  await recipient
    .getByText("This device is authorized", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.equal(await readRoot(recipient), rootKey);
  assert.equal(await readRoot(approver), rootKey);
  const sent = JSON.stringify(mutations);
  assert(!sent.includes(rootKey));
  assert(
    !mutations.some((body) =>
      ["password", "seed", "registrationRecord", "serverSetup"].some(
        (key) => key in body,
      ),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: recipient ${recipientWidth}px / approver ${approverWidth}px; wrong code, reload, explicit approval, root delivery, no overflow`,
  );
  await Promise.all(contexts.map((c) => c.close()));
}
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await scenario(browser, 320, 1280);
    await scenario(browser, 1280, 390);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
