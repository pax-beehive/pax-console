import { describe, expect, it } from "vitest";
import { getAgentTunnelUrl } from "./tunnel-url";

describe("getAgentTunnelUrl", () => {
  it("uses the session-scoped tunnel when a session id is provided", () => {
    expect(getAgentTunnelUrl("agent_1", "sess_1")).toContain(
      "/api/v1/user/self/agents/agent_1/sessions/sess_1/tunnel",
    );
  });
});
