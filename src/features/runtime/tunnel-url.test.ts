import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAgentTunnelUrl } from "./tunnel-url";

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

  it("passes a manager session id through an explicit tunnel override", () => {
    process.env.NEXT_PUBLIC_PAX_WS_BASE_URL = "https://manager.example.test";
    const url = getAgentTunnelUrl("agent_1", "sess_1");

    expect(url).toBe(
      "wss://manager.example.test/api/v1/user/self/agents/agent_1/tunnel?session_id=sess_1",
    );
  });
});
