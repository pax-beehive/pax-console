import { afterEach, expect, it, vi } from "vitest";
import {
  bootstrapRegion,
  measureRegions,
  getRegionalOrigin,
  loadRegionConfig,
} from "./bootstrap";
afterEach(() => vi.unstubAllGlobals());
it("restores an existing assignment with no preference and keeps browser traffic same-origin", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ status: "ready", region: "hk", user_id: "usr_hk" }),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", { location: { origin: "https://pax.example" } });
  expect(await bootstrapRegion()).toMatchObject({
    status: "ready",
    region: "hk",
  });
  expect(
    JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    ),
  ).toEqual({});
  expect(getRegionalOrigin()).toBe("https://pax.example");
});
it("requires a valid selection result and never falls back on failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ status: "selection_required", regions: ["us", "hk"] }),
    ),
  );
  expect(await bootstrapRegion()).toMatchObject({
    status: "selection_required",
  });
  for (const response of [
    new Response("login", { status: 302 }),
    Response.json({ error: "offline" }, { status: 503 }),
    Response.json({ status: "ready", region: "xx" }),
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    await expect(bootstrapRegion("hk")).rejects.toThrow();
  }
});
it("only recommends a reachable origin and verifies fresh probe nonces", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "https://pax.example");
      return url.pathname.endsWith("hk")
        ? Response.json({ region: "hk", nonce: url.searchParams.get("nonce") })
        : new Response("offline", { status: 503 });
    }),
  );
  const result = await measureRegions();
  expect(result.recommended).toBe("hk");
  expect(result.us).toBeNull();
  expect(result.hk).toBeTypeOf("number");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ region: "hk", nonce: "cached" })),
  );
  expect((await measureRegions()).recommended).toBeNull();
});
it("loads explicit runtime mode; malformed config and transport failures stay blocked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ enabled: false })),
  );
  expect(await loadRegionConfig()).toEqual({ enabled: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ enabled: true, origin: "https://pax.example" }),
    ),
  );
  expect(await loadRegionConfig()).toEqual({
    enabled: true,
    origin: "https://pax.example",
  });
  for (const data of [
    {},
    { enabled: true, origin: "http://evil.example" },
    { enabled: true, origin: "https://pax.example/path" },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(data)),
    );
    await expect(loadRegionConfig()).rejects.toThrow();
  }
});
