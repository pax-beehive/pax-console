import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAgentTunnelUrl, resolveHostedWsBaseUrl } from "./tunnel-url";

const originalWsBaseUrl = process.env.NEXT_PUBLIC_PAX_WS_BASE_URL;

describe("getAgentTunnelUrl", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PAX_WS_BASE_URL;
  });

  afterEach(() => {
    if (originalWsBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_PAX_WS_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_PAX_WS_BASE_URL = originalWsBaseUrl;
    }
  });

  it("defaults browser tunnels to api.paxworkspace.net", () => {
    expect(getAgentTunnelUrl("agent_1")).toBe(
      "wss://api.paxworkspace.net/api/v1/user/self/agents/agent_1/tunnel",
    );
  });

  it("uses the company API for the company Console hostname", () => {
    expect(resolveHostedWsBaseUrl("paxworkspace.net")).toBe(
      "wss://api.paxworkspace.net",
    );
  });

  it("keeps the legacy API for the legacy Console hostname", () => {
    expect(resolveHostedWsBaseUrl("ws.lakeward.net")).toBe(
      "wss://api.lakeward.net",
    );
  });

  it("passes a manager session id through an explicit tunnel override", () => {
    process.env.NEXT_PUBLIC_PAX_WS_BASE_URL = "https://manager.example.test";
    const url = getAgentTunnelUrl("agent_1", "sess_1");

    expect(url).toBe(
      "wss://manager.example.test/api/v1/user/self/agents/agent_1/tunnel?session_id=sess_1",
    );
  });
});
it("uses the same-origin Worker after a verified regional bootstrap", async () => {
  const { vi } = await import("vitest");
  const { bootstrapRegion, loadRegionConfig } =
    await import("../region/bootstrap");
  vi.stubGlobal("window", { location: { origin: "https://paxworkspace.net" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ status: "ready", user_id: "usr_original", region: "hk" }),
    ),
  );
  try {
    await bootstrapRegion();
    expect(getAgentTunnelUrl("agent_one", "sess_one")).toBe(
      "wss://paxworkspace.net/api/v1/user/self/agents/agent_one/tunnel?session_id=sess_one",
    );
  } finally {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ enabled: false })),
    );
    await loadRegionConfig();
    vi.unstubAllGlobals();
  }
});
