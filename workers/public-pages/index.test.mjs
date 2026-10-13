import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.mjs";

const request = (path, init) =>
  new Request(`https://paxworkspace.net${path}`, init);

test("only exact public documents are served, never protected or prefix siblings", async () => {
  for (const path of [
    "/",
    "/api/pax/api/v1/user/self/me",
    "/privacy-export",
    "/privacy/account",
    "/terms-secret",
    "/about/admin",
    "/constructor",
    "/__proto__",
  ]) {
    assert.equal(worker.fetch(request(path)).status, 404, path);
  }
  assert.equal(
    worker.fetch(new Request("https://other.example/privacy")).status,
    404,
  );
});

test("public documents work without identity, scripts, or account requests", async () => {
  for (const path of ["/about", "/privacy", "/terms"]) {
    const response = worker.fetch(request(`${path}?source=check`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.match(body, /Pax Tech LLC/);
    assert.match(body, /14522 104th Ave NE/);
    assert.match(body, /href="\/privacy"/);
    assert.match(body, /href="\/terms"/);
    assert.doesNotMatch(body, /<script|<iframe|<form|TODO|待确认|\[发布/);
    assert.equal(
      await worker.fetch(request(path, { method: "HEAD" })).text(),
      "",
    );
  }
});

test("canonical redirects remain on our domain and mutations are rejected", () => {
  const redirect = worker.fetch(
    request("/privacy/?returnTo=https://example.com"),
  );
  assert.equal(redirect.status, 308);
  assert.equal(
    redirect.headers.get("location"),
    "https://paxworkspace.net/privacy?returnTo=https://example.com",
  );
  assert.equal(worker.fetch(request("/terms", { method: "POST" })).status, 405);
});
