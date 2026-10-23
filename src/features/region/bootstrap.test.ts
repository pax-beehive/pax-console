import { afterEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/api/errors";
import {
  bootstrapRegion,
  measureRegions,
  getRegionalOrigin,
  loadRegionConfig,
} from "./bootstrap";
afterEach(() => vi.unstubAllGlobals());
it("distinguishes a missing session from a regional outage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 401 })),
  );
  await expect(bootstrapRegion()).rejects.toBeInstanceOf(AuthError);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await expect(bootstrapRegion()).rejects.not.toBeInstanceOf(AuthError);
});
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
it("validates direct destinations and remembers only configured region names", async () => {
  const { rememberedRegionOrigin, isDirectRegion, getAssignedRegion } =
    await import("./bootstrap");
  const config = {
    enabled: true,
    mode: "direct",
    region: "us",
    origin: "https://us.example",
    origins: { us: "https://us.example", hk: "https://hk.example" },
    entry: true,
  };
  const storage = { getItem: vi.fn(() => "hk"), setItem: vi.fn() };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(config)),
  );
  const loaded = await loadRegionConfig();
  expect(rememberedRegionOrigin(loaded)).toBe("https://hk.example");
  expect(isDirectRegion()).toBe(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        status: "ready",
        user_id: "usr_old",
        region: "hk",
        origin: "https://hk.example",
      }),
    ),
  );
  expect(await bootstrapRegion()).toMatchObject({
    origin: "https://hk.example",
  });
  expect(getRegionalOrigin()).toBe("https://hk.example");
  expect(storage.setItem).toHaveBeenCalledWith("pax:account-region", "hk");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        status: "ready",
        user_id: "usr_old",
        region: "us",
        origin: "https://evil.example",
      }),
    ),
  );
  await expect(bootstrapRegion()).rejects.toThrow("destination");
  expect(getAssignedRegion()).toBe("hk");
  storage.getItem.mockReturnValue("https://evil.example");
  expect(rememberedRegionOrigin(loaded)).toBeUndefined();
  for (const patch of [
    { region: "eu" },
    { origins: { us: "https://us.example", hk: "http://hk.example" } },
    { origins: { us: "https://hk.example", hk: "https://hk.example" } },
    { origins: {} },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...config, ...patch })),
    );
    await expect(loadRegionConfig()).rejects.toThrow();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ enabled: false })),
  );
  await loadRegionConfig();
});
it("bypasses a stale entry hint after an authoritative return to avoid a region loop", async () => {
  const { rememberedRegionOrigin } = await import("./bootstrap");
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      search: "?session_id=one&pax_region_return=1",
      href: "https://us.example/?session_id=one&pax_region_return=1#turn",
    },
    history: { replaceState, state: null },
  });
  vi.stubGlobal("localStorage", { getItem: () => "hk" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        enabled: true,
        mode: "direct",
        region: "us",
        origin: "https://us.example",
        origins: { us: "https://us.example", hk: "https://hk.example" },
        entry: true,
      }),
    ),
  );
  expect(rememberedRegionOrigin(await loadRegionConfig())).toBeUndefined();
  expect(replaceState.mock.calls[0][2].href).toBe(
    "https://us.example/?session_id=one#turn",
  );
  window.location.search = "?session_id=one";
  expect(rememberedRegionOrigin(await loadRegionConfig())).toBeUndefined();
});
