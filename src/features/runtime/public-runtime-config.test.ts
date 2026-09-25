import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publicRuntimeConfigFromEnv,
  serializePublicRuntimeConfig,
} from "./public-runtime-config";
import { getAgentTunnelUrl } from "./tunnel-url";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runtime release configuration", () => {
  it("changes staging and production origins without changing the bundle", () => {
    vi.stubEnv("NEXT_PUBLIC_PAX_WS_BASE_URL", "wss://build.example.test");
    for (const origin of [
      "wss://stage-api.paxworkspace.net",
      "wss://api.paxworkspace.net",
    ]) {
      vi.stubGlobal(
        "__PAX_RUNTIME_CONFIG__",
        publicRuntimeConfigFromEnv({ PAX_RUNTIME_WS_BASE_URL: origin }),
      );
      expect(getAgentTunnelUrl("agent_1")).toBe(
        `${origin}/api/v1/user/self/agents/agent_1/tunnel`,
      );
    }
  });
  it("exposes only allowlisted non-secret fields", () => {
    const config = publicRuntimeConfigFromEnv({
      PAX_RUNTIME_WS_BASE_URL: "wss://stage.example.test",
      PAX_MANAGER_URL: "http://private-manager",
      PAX_CF_AUTHORIZATION: "secret",
      PAX_RELEASE_ID: "r1",
      PAX_COMMIT_SHA: "abc",
    });
    expect(config).toEqual({
      wsBaseUrl: "wss://stage.example.test",
      releaseId: "r1",
      commitSha: "abc",
    });
    expect(serializePublicRuntimeConfig(config)).not.toContain("secret");
  });
  it.each([
    "https://example.test",
    "wss://user:secret@example.test",
    "wss://example.test/path",
    "wss://example.test?token=secret",
  ])("rejects invalid origin %s", (origin) => {
    expect(() =>
      publicRuntimeConfigFromEnv({ PAX_RUNTIME_WS_BASE_URL: origin }),
    ).toThrow();
  });
  it("escapes inline script delimiters", () => {
    expect(
      serializePublicRuntimeConfig({
        releaseId: "</script><script>alert(1)</script>",
      }),
    ).not.toContain("<");
  });
});
