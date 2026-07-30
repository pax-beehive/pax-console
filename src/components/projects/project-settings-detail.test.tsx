/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Agent, Node } from "@/features/api/types";
import { ProjectSettingsDetail } from "./project-settings-detail";

const mocks = vi.hoisted(() => ({
  createProjectTarget: vi.fn(),
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
});

afterEach(() => cleanup());

describe("ProjectSettingsDetail", () => {
  it("shows the project path and reusable targets without session creation controls", () => {
    renderDetail();

    expect(screen.getByText("Pax / Manager")).toBeVisible();
    expect(screen.getByText("Local manager")).toBeVisible();
    expect(screen.getByText("~/pax-manager")).toBeVisible();
    expect(screen.getByText(/Codex · Development Mac/)).toBeVisible();
    expect(screen.getByText("Default")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Start session" }),
    ).not.toBeInTheDocument();
  });

  it("creates another target for the same project", async () => {
    mocks.createProjectTarget.mockResolvedValue({
      target: {
        ...mocks.useProjectTargets().data.targets[1],
        target_id: "target_3",
      },
    });

    renderDetail();

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

    renderDetail();

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
});

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProjectSettingsDetail
          agents={agents}
          nodes={nodes}
          projectId="project_2"
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
