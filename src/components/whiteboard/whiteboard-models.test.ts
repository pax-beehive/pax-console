import { describe, expect, it } from "vitest";
import {
  canUseWhiteboard,
  clampBoardPosition,
  clampZoom,
  createTaskArea,
  layoutAgentPositions,
  nextTaskAreaIndex,
  sortOverviewAgents,
} from "./whiteboard-models";

describe("whiteboard models", () => {
  it("allows only admin users into the whiteboard", () => {
    expect(canUseWhiteboard({ user_id: "u_1", is_admin: true })).toBe(true);
    expect(canUseWhiteboard({ user_id: "u_2", role: "admin" })).toBe(true);
    expect(
      canUseWhiteboard({ email: "local@example.local", user_id: "u_local" }),
    ).toBe(true);
    expect(canUseWhiteboard({ user_id: "u_3", role: "member" })).toBe(false);
    expect(canUseWhiteboard({ user_id: "u_4" })).toBe(false);
  });

  it("creates sequential task areas", () => {
    const first = createTaskArea(1);

    expect(first.name).toBe("Task area 1");
    expect(first.description).toBe("Coordinate a scoped agent session cluster.");
    expect(first.planner).toMatchObject({
      name: "Planner",
      status: "ready",
    });
    expect(nextTaskAreaIndex([first])).toBe(2);
  });

  it("creates task areas from explicit names and descriptions", () => {
    const task = createTaskArea(2, {
      description: "Ship the review queue.",
      name: "Review lane",
    });

    expect(task).toMatchObject({
      description: "Ship the review queue.",
      name: "Review lane",
    });
  });

  it("clamps board coordinates inside a task area", () => {
    expect(clampBoardPosition(-20, 600)).toBe(16);
    expect(clampBoardPosition(240, 600)).toBe(240);
    expect(clampBoardPosition(999, 600)).toBe(420);
    expect(clampBoardPosition(Number.NaN, 600)).toBe(24);
  });

  it("lays agents out on a stable grid", () => {
    expect(
      layoutAgentPositions([{ id: "a" }, { id: "b" }, { id: "c" }]),
    ).toEqual([
      { id: "a", x: 48, y: 56 },
      { id: "b", x: 268, y: 56 },
      { id: "c", x: 48, y: 206 },
    ]);
  });

  it("clamps zoom to the supported manual range", () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(1.25)).toBe(1.25);
    expect(clampZoom(3)).toBe(1.6);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("sorts overview agents with needs-help and done agents first", () => {
    const sorted = sortOverviewAgents([
      { name: "Ready", status: "ready" },
      { name: "Done B", status: "done" },
      { name: "Help B", status: "needs_help" },
      { name: "Running", status: "running" },
      { name: "Done A", status: "done" },
      { name: "Help A", status: "needs_help" },
    ]);

    expect(sorted.map((agent) => agent.name)).toEqual([
      "Help A",
      "Help B",
      "Done A",
      "Done B",
      "Running",
      "Ready",
    ]);
  });
});
