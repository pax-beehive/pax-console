import { describe, expect, it } from "vitest";
import { createTranslator } from "@/features/i18n/translate";
import { connectionState, serviceHealth } from "./service-health";

describe("service health", () => {
  it("given Chinese locale, when summarizing resource counts, then interpolates translated status", () => {
    const result = serviceHealth({
      t: createTranslator("zh-CN"),
      health: { status: "ok" },
      nodes: [{ node_id: "device", online: true }],
      agents: [],
      loading: false,
      error: false,
    });
    expect(result.title).toBe("所有系统运行正常");
    expect(result.description).toBe("1 台设备和 0 个智能体在线。");
  });
  const healthy = {
    health: { status: "ok" },
    nodes: [{ node_id: "n1", online: true }],
    agents: [{ agent_id: "a1", online: true }],
    loading: false,
    error: false,
  };
  it("excludes CLI identities from device health and counts", () => {
    const nodes = [
      ...healthy.nodes,
      { node_id: "cli-offline", kind: "paxl", online: false },
      { node_id: "cli-unknown", kind: "paxl" },
    ];
    expect(serviceHealth({ ...healthy, nodes })).toEqual({
      title: "All systems operational",
      description: "1 device(s) and 1 agent(s) online.",
      tone: "success",
    });
    expect(
      serviceHealth({ ...healthy, nodes: nodes.slice(1), agents: [] }),
    ).toEqual({
      title: "PAX is operational",
      description: "0 device(s) and 0 agent(s) online.",
      tone: "success",
    });
  });
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
