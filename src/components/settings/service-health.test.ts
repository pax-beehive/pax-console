import { describe, expect, it } from "vitest";
import { connectionState, serviceHealth } from "./service-health";

describe("service health", () => {
  const healthy = {
    health: { status: "ok" },
    nodes: [{ node_id: "n1", online: true }],
    agents: [{ agent_id: "a1", online: true }],
    loading: false,
    error: false,
  };
  it("does not infer agent availability from its device", () => {
    expect(
      serviceHealth({
        ...healthy,
        agents: [{ agent_id: "a1", node_id: "n1", online: false }],
      }).tone,
    ).toBe("warning");
    expect(
      serviceHealth({ ...healthy, agents: [{ agent_id: "a1" }] }).title,
    ).toBe("Some status is unknown");
  });
  it("never reports success during loading, failed checks or missing data", () => {
    expect(serviceHealth({ ...healthy, loading: true }).title).toBe(
      "Checking status",
    );
    expect(serviceHealth({ ...healthy, error: true }).title).toBe(
      "Status unavailable",
    );
    expect(serviceHealth({ ...healthy, health: undefined }).title).toBe(
      "Status unknown",
    );
    expect(
      serviceHealth({ ...healthy, health: { status: "degraded" } }).tone,
    ).toBe("warning");
    expect(serviceHealth(healthy).tone).toBe("success");
  });
  it("respects explicit offline flags and leaves unreported states unknown", () => {
    expect(connectionState({ online: false, status: "online" })).toBe(
      "Offline",
    );
    expect(connectionState({})).toBe("Unknown");
  });
});
