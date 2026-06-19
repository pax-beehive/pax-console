import { describe, expect, it } from "vitest";
import { getAgentTunnelUrl } from "./tunnel-url";

describe("getAgentTunnelUrl", () => {
  it("passes a manager session id through the agent tunnel query", () => {
    const url = getAgentTunnelUrl("agent_1", "sess_1");

    expect(url).toContain("/api/v1/user/self/agents/agent_1/tunnel");
    expect(url).toContain("session_id=sess_1");
  });
});
