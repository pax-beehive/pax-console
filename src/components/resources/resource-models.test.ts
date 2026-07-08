import { describe, expect, it } from "vitest";
import { Agent, AgentSession, Node } from "@/features/api/types";
import {
  buildAgentRows,
  buildSessionRows,
  byLastActiveDesc,
  isActiveAgent,
  isActiveNode,
  isActiveSession,
  paginateItems,
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

  it("sorts sessions by activity timestamp before report update time", () => {
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
      "session_old_updated",
      "session_new_updated",
      "session_missing_time",
    ]);
  });

  it("paginates sessions and clamps the requested page", () => {
    const sessions: AgentSession[] = Array.from({ length: 7 }, (_, index) => ({
      agent_id: "agent_1",
      node_id: "node_1",
      session_id: `session_${index + 1}`,
    }));

    const secondPage = paginateItems(sessions, 2, 3);

    expect(secondPage).toMatchObject({
      currentPage: 2,
      endIndex: 6,
      pageCount: 3,
      startIndex: 4,
      totalCount: 7,
    });
    expect(secondPage.items.map((session) => session.session_id)).toEqual([
      "session_4",
      "session_5",
      "session_6",
    ]);

    expect(paginateItems(sessions, 99, 3).currentPage).toBe(3);
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

  it("adds readable node labels to flattened agents", () => {
    const agents: Agent[] = [
      {
        agent_id: "agent_codex",
        name: "Codex",
        node_id: "node_mac",
      },
      {
        agent_id: "agent_remote",
        node_id: "node_unknown",
      },
    ];
    const nodes: Node[] = [
      {
        name: "desk mac",
        node_id: "node_mac",
        online: true,
      },
    ];

    const rows = buildAgentRows(agents, nodes);

    expect(rows).toMatchObject([
      {
        agent_id: "agent_codex",
        nodeActive: true,
        nodeLabel: "desk mac",
      },
      {
        agent_id: "agent_remote",
        nodeActive: false,
        nodeLabel: "node_unknown",
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
