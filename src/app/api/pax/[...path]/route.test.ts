import { NextRequest } from "next/server";
import { Mock, afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("PAX API proxy route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to api.paxtech.net as the manager upstream", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 200, data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://console.paxtech.net/api/pax/api/v1/user/self/me?fresh=1",
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
      "https://api.paxtech.net/api/v1/user/self/me?fresh=1",
    );
    expect((init.headers as Headers).get("Cf-Access-Jwt-Assertion")).toBe(
      "jwt",
    );
  });
});
