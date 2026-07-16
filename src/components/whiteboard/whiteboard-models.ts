import { User } from "@/features/api/types";
import { WhiteboardAgent } from "@/features/api/whiteboard";

export type TaskArea = {
  archivedAt?: string;
  description: string;
  id: string;
  name: string;
  planner: {
    id: string;
    name: string;
    sessionId: string;
    status: "ready" | "running" | "done";
  };
};

export type PositionedAgent = Pick<WhiteboardAgent, "id" | "x" | "y">;

export function canUseWhiteboard(user: User) {
  return (
    user.is_admin === true ||
    user.role?.toLowerCase() === "admin" ||
    user.email?.toLowerCase() === "local@example.local"
  );
}

export function createTaskArea(
  index: number,
  input?: { description?: string; name?: string },
): TaskArea {
  return {
    description:
      input?.description?.trim() || "Coordinate a scoped agent session cluster.",
    id: `area_${Date.now().toString(36)}_${index}`,
    name: input?.name?.trim() || `Task area ${index}`,
    planner: {
      id: `planner_${index}`,
      name: "Planner",
      sessionId: `sess_planner_${index}`,
      status: "ready",
    },
  };
}

export function nextTaskAreaIndex(areas: TaskArea[]) {
  return areas.length + 1;
}

export function clampBoardPosition(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 24;
  }

  return Math.min(Math.max(value, 16), Math.max(16, max - 180));
}

export function nextAgentPosition(existingAgents: Pick<WhiteboardAgent, "x" | "y">[]) {
  return layoutAgentPositions(
    existingAgents.map((agent, index) => ({
      id: `existing_${index}`,
      x: agent.x,
      y: agent.y,
    })).concat({ id: "next", x: 0, y: 0 }),
  ).at(-1)!;
}

export function layoutAgentPositions(
  agents: Pick<WhiteboardAgent, "id">[],
): PositionedAgent[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(agents.length)));
  return agents.map((agent, index) => ({
    id: agent.id,
    x: 48 + (index % columns) * 220,
    y: 56 + Math.floor(index / columns) * 150,
  }));
}

export function clampZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 0.5), 1.6);
}

export function sortOverviewAgents<T extends Pick<WhiteboardAgent, "name" | "status">>(
  agents: T[],
) {
  const priority: Record<WhiteboardAgent["status"], number> = {
    needs_help: 0,
    done: 1,
    running: 2,
    ready: 3,
    initializing: 4,
  };

  return [...agents].sort((left, right) => {
    const statusDelta = priority[left.status] - priority[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.name.localeCompare(right.name);
  });
}
