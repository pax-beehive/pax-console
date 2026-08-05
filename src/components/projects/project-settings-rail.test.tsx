/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Project } from "@/features/api/types";
import { ProjectSettingsRail } from "./project-settings-rail";

const mocks = vi.hoisted(() => ({
  archiveProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  useProjects: vi.fn(),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    archiveProject: mocks.archiveProject,
    createProject: mocks.createProject,
    updateProject: mocks.updateProject,
    useProjects: mocks.useProjects,
  };
});

const projects: Project[] = [
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
];

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

beforeEach(() => {
  mocks.archiveProject.mockReset();
  mocks.createProject.mockReset();
  mocks.updateProject.mockReset();
  mocks.useProjects.mockReset();
  mocks.useProjects.mockReturnValue({
    data: { projects },
    error: null,
    isLoading: false,
  });
});

afterEach(() => cleanup());

afterAll(() => vi.unstubAllGlobals());

describe("ProjectRail", () => {
  it("shows the project hierarchy and selects a child project", async () => {
    const onSelectProject = vi.fn();

    renderRail(onSelectProject);

    expect(screen.getByText("Pax")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Manager" }));

    expect(onSelectProject).toHaveBeenCalledWith("project_2");
  });

  it("creates a project under an existing parent", async () => {
    const onSelectProject = vi.fn();
    const createdProject: Project = {
      ...projects[1],
      display_name: "Console",
      project_id: "project_3",
    };
    mocks.createProject.mockResolvedValue({ project: createdProject });

    renderRail(onSelectProject);

    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project name" }),
      "Console",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Parent project" }),
      "project_1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mocks.createProject).toHaveBeenCalledWith("user_1", {
        display_name: "Console",
        parent_project_id: "project_1",
      }),
    );
    expect(onSelectProject).toHaveBeenCalledWith("project_3");
  });

  it("edits a project and allows moving it to the root", async () => {
    const onSelectProject = vi.fn();
    const updatedProject = {
      ...projects[1],
      display_name: "Manager API",
      parent_project_id: undefined,
    };
    mocks.updateProject.mockResolvedValue({ project: updatedProject });

    renderRail(onSelectProject);

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Manager" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit project" }),
    );
    const name = screen.getByRole("textbox", { name: "Project name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Manager API");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Parent project" }),
      "",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith("user_1", "project_2", {
        display_name: "Manager API",
        parent_project_id: "",
      }),
    );
  });

  it("archives a project after confirmation", async () => {
    mocks.archiveProject.mockResolvedValue({ project: projects[1] });

    renderRail(vi.fn());

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Manager" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Archive project" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Archive project" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Archive project" }),
    );

    await waitFor(() =>
      expect(mocks.archiveProject).toHaveBeenCalledWith("user_1", "project_2"),
    );
  });
});

function renderRail(onSelectProject: (projectId: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProjectSettingsRail
          onSelectProject={onSelectProject}
          selectedProjectId="project_1"
          userId="user_1"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
