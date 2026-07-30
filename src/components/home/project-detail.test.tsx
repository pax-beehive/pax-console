/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Agent, AgentSession, Node } from "@/features/api/types";
import { ProjectDetail } from "./project-detail";

const mocks = vi.hoisted(() => ({
  createProjectTarget: vi.fn(),
  createProjectTargetSession: vi.fn(),
  listUserSessions: vi.fn(),
  updateProjectTarget: vi.fn(),
  useProject: vi.fn(),
  useProjects: vi.fn(),
  useProjectTargets: vi.fn(),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    createProjectTarget: mocks.createProjectTarget,
    createProjectTargetSession: mocks.createProjectTargetSession,
    listUserSessions: mocks.listUserSessions,
    updateProjectTarget: mocks.updateProjectTarget,
    useProject: mocks.useProject,
    useProjects: mocks.useProjects,
    useProjectTargets: mocks.useProjectTargets,
  };
});

const agents: Agent[] = [
  {
    agent_id: "agent_1",
    name: "Codex",
    node_id: "node_1",
    online: true,
  },
  {
    agent_id: "agent_2",
    name: "Claude",
    node_id: "node_2",
    online: false,
  },
];
const nodes: Node[] = [
  { name: "Development Mac", node_id: "node_1", online: true },
  { name: "Build Mac", node_id: "node_2", online: false },
];
const session: AgentSession = {
  agent_id: "agent_1",
  name: "Implement logical projects",
  node_id: "node_1",
  primary_project_id: "project_2",
  session_id: "session_1",
  updated_at: "2026-07-29T12:00:00Z",
};
const targets = [
  {
    agent_id: "agent_1",
    created_at: "2026-07-29T12:00:00Z",
    cwd: "~/pax-manager",
    display_name: "Local manager",
    enabled: true,
    is_default: true,
    project_id: "project_2",
    target_id: "target_1",
    updated_at: "2026-07-29T12:00:00Z",
  },
  {
    agent_id: "agent_2",
    created_at: "2026-07-29T12:00:00Z",
    cwd: "~/pax-manager-docs",
    display_name: "Docs workspace",
    enabled: true,
    is_default: false,
    project_id: "project_2",
    target_id: "target_2",
    updated_at: "2026-07-29T12:00:00Z",
  },
];

beforeEach(() => {
  mocks.createProjectTarget.mockReset();
  mocks.createProjectTargetSession.mockReset();
  mocks.listUserSessions.mockReset();
  mocks.updateProjectTarget.mockReset();
  mocks.useProject.mockReset();
  mocks.useProjects.mockReset();
  mocks.useProjectTargets.mockReset();
  mocks.useProject.mockReturnValue({
    data: {
      project: {
        created_at: "2026-07-29T12:00:00Z",
        display_name: "Manager",
        owner_user_id: "user_1",
        parent_project_id: "project_1",
        project_id: "project_2",
        updated_at: "2026-07-29T12:00:00Z",
      },
    },
    error: null,
    isLoading: false,
  });
  mocks.useProjects.mockReturnValue({
    data: {
      projects: [
        {
          created_at: "2026-07-29T12:00:00Z",
          display_name: "Pax",
          owner_user_id: "user_1",
          project_id: "project_1",
          updated_at: "2026-07-29T12:00:00Z",
        },
        {
          created_at: "2026-07-29T12:00:00Z",
          display_name: "Manager",
          owner_user_id: "user_1",
          parent_project_id: "project_1",
          project_id: "project_2",
          updated_at: "2026-07-29T12:00:00Z",
        },
      ],
    },
  });
  mocks.useProjectTargets.mockReturnValue({
    data: { targets },
    error: null,
    isLoading: false,
  });
  mocks.listUserSessions.mockResolvedValue({ sessions: [session] });
});

afterEach(() => cleanup());

describe("ProjectDetail", () => {
  it("shows the project path, reusable targets, and recent project sessions", async () => {
    const onOpenSession = vi.fn();

    renderDetail(onOpenSession);

    expect(screen.getByText("Pax / Manager")).toBeVisible();
    expect(screen.getByText("Local manager")).toBeVisible();
    expect(screen.getByText("~/pax-manager")).toBeVisible();
    expect(screen.getByText(/Codex · Development Mac/)).toBeVisible();
    expect(screen.getByText("Default")).toBeVisible();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Open session Implement logical projects",
      }),
    );

    expect(onOpenSession).toHaveBeenCalledWith(session);
    expect(mocks.listUserSessions).toHaveBeenCalledWith("user_1", {
      pageSize: 10,
      primaryProjectId: "project_2",
    });
  });

  it("creates another target for the same project", async () => {
    mocks.createProjectTarget.mockResolvedValue({
      target: {
        ...mocks.useProjectTargets().data.targets[1],
        target_id: "target_3",
      },
    });

    renderDetail(vi.fn());

    await userEvent.click(
      screen.getByRole("button", { name: "Add workspace target" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Target name" }),
      "Review workspace",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Target agent" }),
      "agent_2",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Target workspace" }),
      "~/pax-manager-review",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Make default" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create target" }),
    );

    await waitFor(() =>
      expect(mocks.createProjectTarget).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        {
          agent_id: "agent_2",
          cwd: "~/pax-manager-review",
          display_name: "Review workspace",
          enabled: true,
          is_default: true,
        },
      ),
    );
  });

  it("edits, changes the default, and disables targets", async () => {
    mocks.updateProjectTarget.mockResolvedValue({
      target: mocks.useProjectTargets().data.targets[1],
    });

    renderDetail(vi.fn());

    await userEvent.click(
      screen.getByRole("button", { name: "Edit Docs workspace" }),
    );
    const name = screen.getByRole("textbox", { name: "Target name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Docs and review");
    await userEvent.click(screen.getByRole("button", { name: "Save target" }));
    await waitFor(() =>
      expect(mocks.updateProjectTarget).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        "target_2",
        expect.objectContaining({ display_name: "Docs and review" }),
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Make Docs workspace default" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Disable Docs workspace" }),
    );

    await waitFor(() => {
      expect(mocks.updateProjectTarget).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        "target_2",
        { is_default: true },
      );
      expect(mocks.updateProjectTarget).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        "target_2",
        { enabled: false },
      );
    });
  });

  it("requires an explicit target choice when multiple are enabled", async () => {
    const onOpenSession = vi.fn();
    mocks.createProjectTargetSession.mockResolvedValue(session);

    renderDetail(onOpenSession);

    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeDisabled();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Session target" }),
      "target_2",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start session" }),
    );

    await waitFor(() =>
      expect(mocks.createProjectTargetSession).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        "target_2",
        undefined,
      ),
    );
    expect(onOpenSession).toHaveBeenCalledWith(session);
  });

  it("automatically uses the only enabled target and excludes disabled targets", async () => {
    const onOpenSession = vi.fn();
    mocks.useProjectTargets.mockReturnValue({
      data: {
        targets: [targets[0], { ...targets[1], enabled: false }],
      },
      error: null,
      isLoading: false,
    });
    mocks.createProjectTargetSession.mockResolvedValue(session);

    renderDetail(onOpenSession);

    expect(screen.getByText("Using Local manager")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Session target" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Session name" }),
      "Review KEV-8",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start session" }),
    );

    await waitFor(() =>
      expect(mocks.createProjectTargetSession).toHaveBeenCalledWith(
        "user_1",
        "project_2",
        "target_1",
        "Review KEV-8",
      ),
    );
    expect(onOpenSession).toHaveBeenCalledWith(session);
  });
});

function renderDetail(onOpenSession: (session: AgentSession) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProjectDetail
          agents={agents}
          nodes={nodes}
          onOpenSession={onOpenSession}
          projectId="project_2"
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
