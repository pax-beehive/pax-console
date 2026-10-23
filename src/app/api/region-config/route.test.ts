import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("defaults to legacy mode explicitly and never caches configuration", async () => {
  vi.stubEnv("PAX_BROWSER_REGIONS_ENABLED", "");
  const response = await GET();
  expect(await response.json()).toEqual({ enabled: false });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("publishes only the configured canonical origin when enabled", async () => {
  vi.stubEnv("PAX_BROWSER_REGIONS_ENABLED", "true");
  vi.stubEnv("PAX_REGION_PUBLIC_ORIGIN", "https://pax.example");
  expect(await (await GET()).json()).toEqual({
    enabled: true,
    origin: "https://pax.example",
  });
});
it.each(["", "http://pax.example", "https://pax.example/path", "bad"])(
  "fails closed on invalid active config %s",
  async (origin) => {
    vi.stubEnv("PAX_BROWSER_REGIONS_ENABLED", "true");
    vi.stubEnv("PAX_REGION_PUBLIC_ORIGIN", origin);
    expect((await GET()).status).toBe(503);
  },
);
