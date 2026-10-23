import { afterEach, expect, it, vi } from "vitest";
import { parseLoginTarget, confirmRegionalLogin } from "./paxl-login";
afterEach(() => vi.restoreAllMocks());
it("preserves both pending codes without choosing by browser location", () => {
  expect(
    parseLoginTarget(new URLSearchParams("us_code=US1234&hk_code=HK1234")),
  ).toEqual({ codes: { us: "US1234", hk: "HK1234" } });
});
it("preserves an explicit administrator target", () => {
  expect(
    parseLoginTarget(new URLSearchParams("code=ABC123&region=hk&admin=1")),
  ).toEqual({ code: "ABC123", target_region: "hk", admin: true });
});
it.each([
  "code=ABC123&region=other",
  "us_code=bad&hk_code=HK1234",
  "code=ABC123&us_code=US1234",
  "code=ABC123&admin=1",
  "code=ABC123&region=hk&region=us",
])("rejects ambiguous login links: %s", (query) => {
  expect(() => parseLoginTarget(new URLSearchParams(query))).toThrow();
});
it("sends only confirmation information to the same-origin Worker", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { status: "confirmed" } }));
  await expect(
    confirmRegionalLogin({ codes: { us: "US1234", hk: "HK1234" } }),
  ).resolves.toEqual({ status: "confirmed" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/region/paxl-login/approve",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      body: JSON.stringify({ codes: { us: "US1234", hk: "HK1234" } }),
    }),
  );
});
it("shows a mismatched region error without retrying a different region", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ message: "Different account region" }, { status: 409 }),
    );
  await expect(
    confirmRegionalLogin({ code: "ABC123", target_region: "hk" }),
  ).rejects.toThrow("Different account region");
  expect(fetch).toHaveBeenCalledTimes(1);
});
