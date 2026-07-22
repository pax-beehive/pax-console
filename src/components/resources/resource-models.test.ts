import { describe, expect, it } from "vitest";
import { Agent, AgentSession, Node } from "@/features/api/types";
import {
  buildAgentRows,
  buildSessionRows,
  byLastActiveDesc,
  isActiveAgent,
  isActiveNode,
  isActiveSession,
  nodeDaemonRuntimeOutcome,
  paginateItems,
  resourceLastActiveAt,
  sessionUpdatedAt,
} from "./resource-models";

describe("paxd runtime reconciliation", () => {
  const runningConnection = {
    agent_type: "pi",
    command: ["pi"],
    desired_acp_slots: 2,
    desired_state: "running",
    enabled: true,
    generation: 2,
    harness: "pi",
    id: "conn_1",
    instance_id: "default",
    name: "Pi",
    remote_id: "remote_1",
    restart_nonce: 1,
    status: {
      connection_id: "conn_1",
      observed_generation: 2,
      observed_restart_nonce: 1,
      phase: "running",
    },
  };

  it("waits for the requested generation before reporting running", () => {
    expect(
      nodeDaemonRuntimeOutcome(
        {
          action: "update",
          connectionId: "conn_1",
          desiredGeneration: 3,
        },
        [runningConnection],
      ),
    ).toBeUndefined();

    expect(
      nodeDaemonRuntimeOutcome(
        {
          action: "update",
          connectionId: "conn_1",
          desiredGeneration: 2,
        },
        [runningConnection],
      ),
    ).toBe("running");
  });

  it("also waits for the requested restart nonce", () => {
    expect(
      nodeDaemonRuntimeOutcome(
        {
          action: "restart",
          connectionId: "conn_1",
          desiredGeneration: 2,
          desiredRestartNonce: 2,
        },
        [runningConnection],
      ),
    ).toBeUndefined();
  });

  it("reports stop, removal, and terminal runtime failure", () => {
    expect(
      nodeDaemonRuntimeOutcome(
        { action: "remove", connectionId: "conn_1" },
        [],
      ),
    ).toBe("removed");
    expect(
      nodeDaemonRuntimeOutcome(
        { action: "stop", connectionId: "conn_1", desiredGeneration: 2 },
        [
          {
            ...runningConnection,
            status: { ...runningConnection.status, phase: "stopped" },
          },
        ],
      ),
    ).toBe("stopped");
    expect(
      nodeDaemonRuntimeOutcome(
        { action: "start", connectionId: "conn_1", desiredGeneration: 2 },
        [runningConnection],
      ),
    ).toBe("running");
    expect(
      nodeDaemonRuntimeOutcome(
        { action: "create", connectionId: "conn_1", desiredGeneration: 2 },
        [
          {
            ...runningConnection,
            status: { ...runningConnection.status, phase: "failed" },
          },
        ],
      ),
    ).toBe("failed");
  });
});

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

  it("sorts sessions by the latest user prompt without moving for later agent output", () => {
    const sessions: AgentSession[] = [
      {
        agent_id: "agent_1",
        last_user_message_at: "2026-06-29T12:00:00Z",
        last_message_at: "2026-06-29T12:00:01Z",
        node_id: "node_1",
        session_id: "session_old_updated",
        updated_at: "2026-06-28T12:00:00Z",
      },
      {
        agent_id: "agent_1",
        last_user_message_at: "2026-06-29T11:00:00Z",
        last_message_at: "2026-06-29T13:00:00Z",
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
      {
        agent_id: "agent_unassigned",
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
      {
        agent_id: "agent_unassigned",
        nodeActive: false,
        nodeLabel: "No runtime node",
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
