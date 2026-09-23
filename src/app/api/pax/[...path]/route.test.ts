import { NextRequest } from "next/server";
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalManagerUrl = process.env.PAX_MANAGER_URL;

describe("PAX API proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.PAX_MANAGER_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalManagerUrl === undefined) {
      delete process.env.PAX_MANAGER_URL;
    } else {
      process.env.PAX_MANAGER_URL = originalManagerUrl;
    }
  });

  it("defaults to api.lakeward.net as the manager upstream", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 200, data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");

    const request = new NextRequest(
      "https://ws.lakeward.net/api/pax/api/v1/user/self/me?fresh=1",
      { headers: { "Cf-Access-Jwt-Assertion": "jwt" } },
    );
    const response = await GET(request, {
      params: Promise.resolve({ path: ["api", "v1", "user", "self", "me"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as Mock).mock.calls[0] as [
      URL | string,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "https://api.lakeward.net/api/v1/user/self/me?fresh=1",
    );
    expect((init.headers as Headers).get("Cf-Access-Jwt-Assertion")).toBe(
      "jwt",
    );
  });

  it("preserves an explicit manager upstream override", async () => {
    process.env.PAX_MANAGER_URL = "http://localhost:19879";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");

    await GET(
      new NextRequest("https://ws.lakeward.net/api/pax/api/v1/health", {
        headers: { "Cf-Access-Jwt-Assertion": "jwt" },
      }),
      { params: Promise.resolve({ path: ["api", "v1", "health"] }) },
    );

    const [url] = (fetchMock as Mock).mock.calls[0] as [URL | string];
    expect(String(url)).toBe("http://localhost:19879/api/v1/health");
  });

  it("forwards the signed Access cookie as the assertion for an internal upstream", async () => {
    process.env.PAX_MANAGER_URL = "http://pax-manager:9879";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");

    await GET(
      new NextRequest("https://paxworkspace.net/api/pax/api/v1/user/self/me", {
        headers: { cookie: "CF_Authorization=signed-access-jwt" },
      }),
      {
        params: Promise.resolve({
          path: ["api", "v1", "user", "self", "me"],
        }),
      },
    );

    const [, init] = (fetchMock as Mock).mock.calls[0] as [
      URL | string,
      RequestInit,
    ];
    expect((init.headers as Headers).get("Cf-Access-Jwt-Assertion")).toBe(
      "signed-access-jwt",
    );
  });
});
