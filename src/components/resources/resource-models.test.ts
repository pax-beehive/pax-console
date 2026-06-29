import { describe, expect, it } from "vitest";
import { Agent, AgentSession, Node } from "@/features/api/types";
import {
  buildSessionRows,
  byLastActiveDesc,
  isActiveAgent,
  isActiveNode,
  isActiveSession,
  resourceLastActiveAt,
  sessionUpdatedAt,
} from "./resource-models";

describe("resource list models", () => {
  it("sorts resources by most recent activity timestamp", () => {
    const agents: Agent[] = [
      {
        agent_id: "agent_old",
        last_heartbeat: "2026-06-28T12:00:00Z",
        node_id: "node_1",
      },
      {
        agent_id: "agent_new",
        last_active_at: "2026-06-29T12:00:00Z",
        node_id: "node_1",
      },
      {
        agent_id: "agent_missing_time",
        node_id: "node_1",
      },
    ];

    const sorted = byLastActiveDesc(
      agents,
      resourceLastActiveAt,
      (agent) => agent.agent_id,
    );

    expect(sorted.map((agent) => agent.agent_id)).toEqual([
      "agent_new",
      "agent_old",
      "agent_missing_time",
    ]);
  });

  it("sorts sessions by updated_at before fallback timestamps", () => {
    const sessions: AgentSession[] = [
      {
        agent_id: "agent_1",
        last_message_at: "2026-06-29T12:00:00Z",
        node_id: "node_1",
        session_id: "session_old_updated",
        updated_at: "2026-06-28T12:00:00Z",
      },
      {
        agent_id: "agent_1",
        node_id: "node_1",
        session_id: "session_new_updated",
        updated_at: "2026-06-29T08:00:00Z",
      },
      {
        agent_id: "agent_1",
        node_id: "node_1",
        session_id: "session_missing_time",
      },
    ];

    const sorted = byLastActiveDesc(
      sessions,
      sessionUpdatedAt,
      (session) => session.session_id,
    );

    expect(sorted.map((session) => session.session_id)).toEqual([
      "session_new_updated",
      "session_old_updated",
      "session_missing_time",
    ]);
  });

  it("adds readable agent and node labels to flattened sessions", () => {
    const agents: Agent[] = [
      {
        agent_id: "agent_codex",
        agent_type: "codex",
        name: "Codex Workbench",
        node_id: "node_mac",
        online: true,
      },
    ];
    const nodes: Node[] = [
      {
        hostname: "kai-mac.local",
        node_id: "node_mac",
        online: true,
      },
    ];
    const sessions: AgentSession[] = [
      {
        agent_id: "agent_codex",
        node_id: "node_mac",
        session_id: "session_1",
      },
      {
        agent_id: "agent_unknown",
        node_id: "node_unknown",
        session_id: "session_2",
      },
    ];

    const rows = buildSessionRows(sessions, agents, nodes);

    expect(rows).toMatchObject([
      {
        agentActive: true,
        agentLabel: "Codex Workbench",
        nodeActive: true,
        nodeLabel: "kai-mac.local",
        session_id: "session_1",
      },
      {
        agentActive: false,
        agentLabel: "agent_unknown",
        nodeActive: false,
        nodeLabel: "node_unknown",
        session_id: "session_2",
      },
    ]);
  });

  it("filters inactive nodes, agents, and terminal sessions by default", () => {
    expect(isActiveNode({ node_id: "node_1", online: true })).toBe(true);
    expect(isActiveNode({ node_id: "node_2", online: false })).toBe(false);
    expect(
      isActiveAgent({
        agent_id: "agent_1",
        node_id: "node_1",
        status: "running",
      }),
    ).toBe(true);
    expect(
      isActiveAgent({
        agent_id: "agent_2",
        node_id: "node_1",
        status: "offline",
      }),
    ).toBe(false);
    expect(
      isActiveSession({
        agent_id: "agent_1",
        node_id: "node_1",
        run_status: "running",
        session_id: "session_1",
      }),
    ).toBe(true);
    expect(
      isActiveSession({
        agent_id: "agent_1",
        node_id: "node_1",
        run_status: "done",
        session_id: "session_2",
      }),
    ).toBe(false);
  });
});
