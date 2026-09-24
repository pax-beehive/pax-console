import { describe, expect, it } from "vitest";
import {
  buildLocalEnvValues,
  resolveAccessAppUrl,
  upsertEnv,
} from "./sync-cloudflare-access-token.mjs";

describe("sync-cloudflare-access-token", () => {
  it("uses the paxworkspace API application by default", () => {
    expect(resolveAccessAppUrl({})).toBe("https://api.paxworkspace.net");
  });

  it("preserves the configured Access application URL", () => {
    expect(
      resolveAccessAppUrl({
        PAX_ACCESS_APP_URL: "https://access.example.test",
        PAX_MANAGER_URL: "https://manager.example.test",
      }),
    ).toBe("https://access.example.test");
  });

  it("writes the computed application URL into PAX_MANAGER_URL", () => {
    const appUrl = resolveAccessAppUrl({
      PAX_MANAGER_URL: "http://localhost:19879",
    });
    const nextEnv = upsertEnv(
      "PAX_MANAGER_URL=https://legacy.example.test\n",
      buildLocalEnvValues(appUrl, "header.payload.signature"),
    );

    expect(nextEnv).toContain("PAX_MANAGER_URL=http://localhost:19879\n");
    expect(nextEnv).not.toContain("legacy.example.test");
  });
});
