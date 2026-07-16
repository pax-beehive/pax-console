"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export type WhiteboardAgentTemplate = {
  id: string;
  label: string;
  summary: string;
  defaultName: string;
};

export type WhiteboardModelOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

export type WhiteboardAgent = {
  id: string;
  areaId: string;
  templateId: string;
  modelId: string;
  name: string;
  goal: string;
  status: "initializing" | "ready" | "running" | "needs_help" | "done";
  sessionId: string;
  x: number;
  y: number;
};

export type InitializeWhiteboardAgentInput = {
  areaId: string;
  goal: string;
  modelId: string;
  name: string;
  templateId: string;
  x: number;
  y: number;
};

export type BroadcastWhiteboardInput = {
  areaId: string;
  message: string;
  targetAgentIds: string[];
};

const mockTemplates: WhiteboardAgentTemplate[] = [
  {
    id: "agent-codex",
    label: "Codex",
    summary: "Code tasks, repo changes, verification",
    defaultName: "Implementation",
  },
  {
    id: "agent-research",
    label: "Research",
    summary: "Context gathering and source synthesis",
    defaultName: "Research",
  },
  {
    id: "agent-review",
    label: "Review",
    summary: "Risk checks, regression review, test gaps",
    defaultName: "Review",
  },
  {
    id: "agent-operator",
    label: "Operator",
    summary: "Runbooks, deploy notes, coordination",
    defaultName: "Operator",
  },
];

const mockModels: WhiteboardModelOption[] = [
  { id: "default", label: "Default", isDefault: true },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gpt-5-codex", label: "GPT-5 Codex" },
  { id: "o3", label: "o3" },
];

export function useWhiteboardCatalog(enabled = true) {
  return useQuery({
    enabled,
    queryFn: getWhiteboardCatalog,
    queryKey: queryKeys.whiteboardCatalog(),
  });
}

export async function getWhiteboardCatalog() {
  await mockLatency();
  return {
    models: mockModels,
    templates: mockTemplates,
  };
}

export async function initializeWhiteboardAgent(
  input: InitializeWhiteboardAgentInput,
): Promise<WhiteboardAgent> {
  await mockLatency();
  return {
    ...input,
    id: `wba_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    sessionId: `sess_mock_${Math.random().toString(36).slice(2, 10)}`,
    status: "ready",
  };
}

export async function broadcastToWhiteboardAgents(
  input: BroadcastWhiteboardInput,
) {
  await mockLatency();
  return {
    ...input,
    broadcastId: `broadcast_${Date.now().toString(36)}`,
    deliveredAt: new Date().toISOString(),
  };
}

function mockLatency() {
  return new Promise((resolve) => window.setTimeout(resolve, 140));
}
