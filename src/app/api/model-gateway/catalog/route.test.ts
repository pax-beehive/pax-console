import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admin = () =>
  Response.json({ code: 200, data: { revision: 2, enabled: false, pool: {} } });
const catalog = () => Response.json({ data: [] });
const request = (
  query = "provider=openrouter",
  headers: HeadersInit = { "Cf-Access-Jwt-Assertion": "signed-jwt" },
) =>
  new NextRequest(
    `https://paxworkspace.net/api/model-gateway/catalog?${query}`,
    { headers },
  );

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PAX_MANAGER_URL", "http://pax-manager:9879");
  vi.stubEnv("PAX_CF_AUTHORIZATION", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("admin catalog BFF", () => {
  it.each([
    "",
    "provider=anthropic",
    "provider=https://attacker.example",
    "provider=openrouter&provider=openrouter",
    "provider=openrouter&url=https://attacker.example",
  ])("rejects arbitrary/unsupported provider query %s", async (query) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects missing signed identity without contacting either server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect(
      (
        await GET(
          request("provider=openrouter", {
            "X-User-Id": "admin",
            Authorization: "Bearer fake",
          }),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks admin through the fixed Manager endpoint and forwards only signed identity", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(admin())
      .mockResolvedValueOnce(catalog());
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    const response = await GET(
      request("provider=openrouter", {
        "Cf-Access-Jwt-Assertion": "signed-jwt",
        cookie: "unrelated=private",
        Authorization: "Bearer private",
        "X-User-Id": "fake-admin",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      source: "openrouter",
      models: [],
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      "http://pax-manager:9879/api/v1/user/self/hosting-admin?limit=1",
    );
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toEqual({
      accept: "application/json",
      "cf-access-jwt-assertion": "signed-jwt",
    });
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(fetch.mock.calls[1][1]).toMatchObject({
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
  });

  it("uses the signed Access cookie fallback for an internal Manager and never forwards other cookies", async () => {
    delete process.env.PAX_CF_AUTHORIZATION;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(admin())
      .mockResolvedValueOnce(catalog());
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect(
      (
        await GET(
          request("provider=openrouter", {
            cookie: "CF_Authorization=cookie-jwt; other=private",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      Object.fromEntries((fetch.mock.calls[0][1].headers as Headers).entries()),
    ).toEqual({
      accept: "application/json",
      "cf-access-jwt-assertion": "cookie-jwt",
      cookie: "CF_Authorization=cookie-jwt",
    });
  });

  it("supports the existing server-side local development identity fallback", async () => {
    vi.stubEnv("PAX_CF_AUTHORIZATION", "local-signed-jwt");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(admin())
      .mockResolvedValueOnce(catalog());
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect((await GET(request("provider=openrouter", {}))).status).toBe(200);
    expect(
      (fetch.mock.calls[0][1].headers as Headers).get(
        "Cf-Access-Jwt-Assertion",
      ),
    ).toBe("local-signed-jwt");
  });

  it.each([401, 403])(
    "relays only Manager auth status %s and never its body",
    async (status) => {
      const fetch = vi.fn(
        async () => new Response("secret upstream body", { status }),
      );
      vi.stubGlobal("fetch", fetch);
      const { GET } = await import("./route");
      const response = await GET(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("secret");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each([302, 429, 500, 503])(
    "turns Manager status %s into a generic503 without fetching catalog",
    async (status) => {
      const fetch = vi.fn(
        async () => new Response("private-error", { status }),
      );
      vi.stubGlobal("fetch", fetch);
      const { GET } = await import("./route");
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(
        '{"error":{"code":"model_catalog_unavailable"}}',
      );
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("does not accept an HTML login page or unrecognized200 response as admin authorization", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("private login page", {
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 200, data: { is_admin: true } }),
      );
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(503);
    expect((await GET(request())).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rechecks authorization on cache hits and returns no models after admin access is lost", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(admin())
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(new Response("private", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(200);
    const denied = await GET(request());
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("models");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never relays provider auth errors and sanitizes fetch failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(admin())
      .mockResolvedValueOnce(
        new Response("provider-key-secret", { status: 401 }),
      )
      .mockRejectedValueOnce(new Error("manager-token-secret"));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    for (let i = 0; i < 2; i++) {
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
    }
  });

  it("bounds auth response size and hanging Manager authorization", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({}, { headers: { "content-length": "262145" } }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(503);
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await pending).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds the combined Manager and catalog wait to ten seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(admin()), 6000)),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(catalog()), 6000)),
      );
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await pending).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
  });
});
