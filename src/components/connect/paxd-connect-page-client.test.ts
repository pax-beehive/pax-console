import { describe, expect, it } from "vitest";
import { resolvePaxdConnectApiEndpoint } from "./paxd-connect-page-client";

describe("resolvePaxdConnectApiEndpoint", () => {
  it("uses the lakeward API when a pairing preview has no endpoint", () => {
    expect(resolvePaxdConnectApiEndpoint()).toBe("https://api.lakeward.net");
  });

  it("preserves an endpoint reported by paxd", () => {
    expect(
      resolvePaxdConnectApiEndpoint({
        apiEndpoint: "http://manager.home.test:19879",
      }),
    ).toBe("http://manager.home.test:19879");
  });
});
