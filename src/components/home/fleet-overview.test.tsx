/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import type { AgentSession, Project, User } from "@/features/api/types";
import { FleetOverview } from "./fleet-overview";

const localStorageValues = new Map<string, string>();
const localStorageMock: Storage = {
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => [...localStorageValues.keys()][index] ?? null,
  get length() {
    return localStorageValues.size;
  },
  removeItem: (key) => localStorageValues.delete(key),
  setItem: (key, value) => localStorageValues.set(key, value),
};

const mocks = vi.hoisted(() => ({
  completeUserAttachment: vi.fn(),
  createProjectTarget: vi.fn(),
  createUserAttachment: vi.fn(),
  listAgents: vi.fn(),
  listUserSessions: vi.fn(),
  updateAgentSession: vi.fn(),
  routerPush: vi.fn(),
  uploadUserAttachmentFile: vi.fn(),
  useAgentPermissionCatalog: vi.fn(),
  useApprovals: vi.fn(),
  useEnvelopes: vi.fn(),
  useNodes: vi.fn(),
  useProject: vi.fn(),
  useProjects: vi.fn(),
  useProjectTargets: vi.fn(),
  useTeamInvites: vi.fn(),
}));

beforeAll(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/sessions/session-workbench", () => ({
  SessionWorkbench: ({
    agentId,
    embedded,
    initialAttachments,
    initialApprovalMode,
    initialCwd,
    initialInitializeOnly,
    initialPermissionChoiceId,
    initialPrimaryProjectId,
    initialPrompt,
    initialProjectTargetId,
    initialTransport,
    nodeId,
    onSessionAssigned,
    sessionId,
  }: {
    agentId?: string;
    embedded?: boolean;
    initialAttachments?: Array<{ attachmentId: string }>;
    initialApprovalMode?: string;
    initialCwd?: string;
    initialInitializeOnly?: boolean;
    initialPermissionChoiceId?: string;
    initialPrimaryProjectId?: string;
    initialPrompt?: string;
    initialProjectTargetId?: string;
    initialTransport?: "manager" | "e2ee";
    nodeId?: string;
    onSessionAssigned?: (sessionId: string) => void;
    sessionId: string;
  }) => (
    <div
      data-agent-id={agentId}
      data-embedded={String(Boolean(embedded))}
      data-initial-attachments={initialAttachments
        ?.map((attachment) => attachment.attachmentId)
        .join(",")}
      data-initial-approval-mode={initialApprovalMode}
      data-initial-cwd={initialCwd}
      data-initial-initialize-only={String(Boolean(initialInitializeOnly))}
      data-initial-permission-choice-id={initialPermissionChoiceId}
      data-primary-project-id={initialPrimaryProjectId}
      data-initial-prompt={initialPrompt}
      data-initial-transport={initialTransport}
      data-project-target-id={initialProjectTargetId}
      data-node-id={nodeId}
      data-testid="session-workbench"
    >
      {sessionId}
      {sessionId === "new" && (
        <button
          onClick={() => onSessionAssigned?.("sess_native")}
          type="button"
        >
          Assign native session
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    completeUserAttachment: mocks.completeUserAttachment,
    createProjectTarget: mocks.createProjectTarget,
    createUserAttachment: mocks.createUserAttachment,
    listAgents: mocks.listAgents,
    listUserSessions: mocks.listUserSessions,
    updateAgentSession: mocks.updateAgentSession,
    uploadUserAttachmentFile: mocks.uploadUserAttachmentFile,
    useAgentPermissionCatalog: mocks.useAgentPermissionCatalog,
    useApprovals: mocks.useApprovals,
    useEnvelopes: mocks.useEnvelopes,
    useNodes: mocks.useNodes,
    useProject: mocks.useProject,
    useProjects: mocks.useProjects,
    useProjectTargets: mocks.useProjectTargets,
    useTeamInvites: mocks.useTeamInvites,
  };
});

beforeEach(() => {
  localStorageValues.clear();
  window.history.replaceState(null, "", "/");
  mocks.completeUserAttachment.mockReset();
  mocks.createProjectTarget.mockReset();
  mocks.createUserAttachment.mockReset();
  mocks.routerPush.mockReset();
  mocks.updateAgentSession.mockReset();
  mocks.updateAgentSession.mockResolvedValue({
    agent_id: "agent_1",
    archived_at: "2026-08-04T12:00:00.000Z",
    node_id: "node_1",
    session_id: "sess_1",
  });
  mocks.uploadUserAttachmentFile.mockReset();
  mocks.useAgentPermissionCatalog.mockReset();
  mocks.createUserAttachment.mockResolvedValue({
    attachment: {
      attachment_id: "att_1",
      content_type: "text/plain",
      filename: "notes.txt",
      size_bytes: 5,
    },
    upload: {
      headers: {},
      method: "POST",
      url: "https://upload.example.test",
    },
  });
  mocks.uploadUserAttachmentFile.mockResolvedValue(undefined);
  mocks.completeUserAttachment.mockResolvedValue({
    attachment: {
      attachment_id: "att_1",
      content_type: "text/plain",
      filename: "notes.txt",
      size_bytes: 5,
    },
  });
  mocks.createProjectTarget.mockResolvedValue({
    target: {
      agent_id: "agent_1",
      cwd: "~/worktrees/kev-8",
      display_name: "kev-8",
      enabled: true,
      is_default: false,
      project_id: "project_1",
      target_id: "target_2",
    },
  });
  mocks.listAgents.mockResolvedValue({
    agents: [
      {
        agent_id: "agent_1",
        name: "Pi agent",
        node_id: "node_1",
        online: true,
      },
    ],
  });
  mocks.listUserSessions.mockResolvedValue({
    pagination: { page_num: 1, page_size: 20, total: 1, total_pages: 1 },
    sessions: [
      {
        agent_id: "agent_1",
        name: "Session one",
        node_id: "node_1",
        session_id: "sess_1",
        updated_at: "2026-07-20T12:00:00.000Z",
      },
    ],
  });
  mocks.useNodes.mockReturnValue({
    data: {
      nodes: [{ name: "Development Mac", node_id: "node_1", online: true }],
    },
    error: null,
    isLoading: false,
  });
  mocks.useProjects.mockReturnValue({
    data: {
      projects: [
        {
          created_at: "2026-07-20T12:00:00.000Z",
          display_name: "Pax",
          owner_user_id: "user_1",
          project_id: "project_1",
          updated_at: "2026-07-20T12:00:00.000Z",
        },
      ],
    },
    error: null,
    isLoading: false,
  });
  mocks.useProject.mockReturnValue({
    data: {
      project: {
        created_at: "2026-07-20T12:00:00.000Z",
        display_name: "Pax",
        owner_user_id: "user_1",
        project_id: "project_1",
        updated_at: "2026-07-20T12:00:00.000Z",
      },
    },
    error: null,
    isLoading: false,
  });
  mocks.useProjectTargets.mockReturnValue({
    data: {
      targets: [
        {
          agent_id: "agent_1",
          created_at: "2026-07-20T12:00:00.000Z",
          cwd: "~/pax",
          display_name: "Local Pax",
          enabled: true,
          is_default: true,
          project_id: "project_1",
          target_id: "target_1",
          updated_at: "2026-07-20T12:00:00.000Z",
        },
      ],
    },
    error: null,
    isLoading: false,
  });
  mocks.useApprovals.mockReturnValue(emptyQueryData("approvals"));
  mocks.useAgentPermissionCatalog.mockReturnValue({
    data: undefined,
    isError: false,
    isPending: false,
  });
  mocks.useEnvelopes.mockReturnValue(emptyQueryData("envelopes"));
  mocks.useTeamInvites.mockReturnValue(emptyQueryData("invites"));
});

afterEach(() => cleanup());

describe("FleetOverview session rail", () => {
  it("collapses equal combined session names but preserves meaningful pairs", async () => {
    mocks.listUserSessions.mockResolvedValue({
      pagination: { page_num: 1, page_size: 20, total: 3, total_pages: 1 },
      sessions: [
        {
          agent_id: "agent_1",
          name: "pax_workspace (pax_workspace)",
          node_id: "node_1",
          session_id: "sess_equal",
          updated_at: "2026-07-20T14:00:00.000Z",
        },
        {
          agent_id: "agent_1",
          name: "Custom label (runtime label)",
          name_is_custom: true,
          node_id: "node_1",
          session_id: "sess_distinct",
          updated_at: "2026-07-20T13:00:00.000Z",
        },
        {
          agent_id: "agent_1",
          current_task: "Fallback task",
          node_id: "node_1",
          session_id: "sess_fallback",
          updated_at: "2026-07-20T12:00:00.000Z",
        },
      ],
    });

    renderOverview();

    expect(
      await screen.findByRole("link", { name: /pax_workspace/ }),
    ).toBeVisible();
    expect(
      screen.queryByText("pax_workspace (pax_workspace)"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Custom label \(runtime label\)/ }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Fallback task/ })).toBeVisible();
  });

  it("gives the native project picker a visible surface and custom arrow", async () => {
    renderOverview();
    const picker = await screen.findByRole("combobox", { name: "Project" });
    expect(picker).toHaveClass("appearance-none", "truncate", "text-base");
    expect(picker.parentElement).toHaveClass(
      "bg-surface-2",
      "border-hairline-strong",
    );
    expect(
      picker.parentElement?.querySelector("svg.pointer-events-none"),
    ).not.toBeNull();
  });

  it("uses the permission catalog in the Home new-session composer", async () => {
    mocks.useAgentPermissionCatalog.mockReturnValue({
      data: {
        catalog_revision: 4,
        choices: [
          {
            choice_id: "agent:workspace",
            kind: "agent",
            label: "Workspace access",
          },
          {
            choice_id: "agent:full-access",
            kind: "agent",
            label: "Full access",
          },
        ],
        default_choice_id: "agent:workspace",
        source: "profile",
        stale: false,
      },
      isError: false,
      isPending: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const permissionSelector = await screen.findByRole("button", {
      name: "Session permissions: Workspace access",
    });
    await userEvent.click(permissionSelector);

    expect(
      screen.getByRole("menuitemradio", { name: "Full access" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitemradio", { name: /Auto approve \(PAX\)/ }),
    ).toBeVisible();
  });

  it("isolates permission choices by agent and commits a pending manual fallback", async () => {
    mocks.listAgents.mockResolvedValue({
      agents: [
        {
          agent_id: "agent_1",
          name: "Pi agent",
          node_id: "node_1",
          online: true,
        },
        {
          agent_id: "agent_2",
          name: "Second agent",
          node_id: "node_1",
          online: true,
        },
      ],
    });
    let secondAgentPending = true;
    const catalog = {
      catalog_revision: 4,
      choices: [
        {
          choice_id: "agent:workspace",
          kind: "agent" as const,
          label: "Workspace access",
        },
        {
          choice_id: "agent:full-access",
          kind: "agent" as const,
          label: "Full access",
          requires_confirmation: true,
        },
      ],
      default_choice_id: "agent:workspace",
      source: "profile" as const,
      stale: false,
    };
    mocks.useAgentPermissionCatalog.mockImplementation(
      (_userId: string, agentId?: string) =>
        agentId === "agent_2" && secondAgentPending
          ? { data: undefined, isError: false, isPending: true }
          : { data: catalog, isError: false, isPending: false },
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fleetView = () => (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(fleetView());

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Session permissions: Workspace access",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Full access/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use this permission" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Session permissions: Full access",
      }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Pi agent" }));
    await userEvent.click(screen.getByRole("button", { name: "Second agent" }));
    expect(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    ).toBeVisible();

    secondAgentPending = false;
    rerender(fleetView());
    expect(
      screen.getByRole("button", {
        name: "Session permissions: Workspace access",
      }),
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Workspace access",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Full access/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use this permission" }),
    );

    secondAgentPending = true;
    rerender(fleetView());
    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Ask before tools/ }),
    );
    secondAgentPending = false;
    rerender(fleetView());

    expect(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    ).toBeVisible();
  });

  it("combines agent, node, and archived controls in one session filter", async () => {
    const user = userEvent.setup();
    mocks.listAgents.mockResolvedValue({
      agents: [
        {
          agent_id: "agent_1",
          name: "Pi agent with a deliberately long display name",
          node_id: "node_1",
          online: true,
        },
        {
          agent_id: "agent_2",
          name: "Second agent",
          node_id: "node_2",
          online: true,
        },
      ],
    });
    mocks.useNodes.mockReturnValue({
      data: {
        nodes: [
          { name: "Development Mac", node_id: "node_1", online: true },
          { name: "Remote Mac", node_id: "node_2", online: true },
        ],
      },
      error: null,
      isLoading: false,
    });
    renderOverview();

    await user.click(screen.getByRole("button", { name: "Filter sessions" }));

    expect(screen.getByText("Agent")).toBeVisible();
    expect(screen.getByText("Node")).toBeVisible();
    const agentFilterGroup = screen.getByRole("group", {
      name: "Filter by agent",
    });
    expect(
      within(agentFilterGroup).getByText(
        "Pi agent with a deliberately long display name",
      ),
    ).toHaveClass("truncate");
    await user.click(
      await screen.findByRole("button", {
        name: "Agent Pi agent with a deliberately long display name",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Agent Second agent" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Node Development Mac" }),
    );
    await user.click(screen.getByRole("button", { name: "Node Remote Mac" }));
    const includeArchived = screen.getByRole("button", {
      name: "Include archived",
    });
    expect(includeArchived).toHaveAttribute("aria-pressed", "false");
    await user.click(includeArchived);
    expect(includeArchived).toHaveAttribute("aria-pressed", "true");

    await waitFor(() =>
      expect(mocks.listUserSessions).toHaveBeenLastCalledWith(
        "user_1",
        expect.objectContaining({
          agentIds: ["agent_1", "agent_2"],
          includeArchived: true,
          nodeIds: ["node_1", "node_2"],
        }),
      ),
    );
  });

  it("archives a session from its rail row", async () => {
    const user = userEvent.setup();
    renderOverview();

    await user.click(
      await screen.findByRole("button", { name: "Archive Session one" }),
    );

    await waitFor(() =>
      expect(mocks.updateAgentSession).toHaveBeenCalledWith(
        "user_1",
        "node_1",
        "agent_1",
        "sess_1",
        { archived: true },
      ),
    );
  });

  it("restores an archived session when archived sessions are included", async () => {
    const user = userEvent.setup();
    const archivedSession = sessionFixture(
      "sess_archived",
      "Archived session",
      "project_1",
    );
    archivedSession.archived_at = "2026-08-04T12:00:00.000Z";
    setProjectContents([projectFixture("project_1", "Pax")], [archivedSession]);
    mocks.updateAgentSession.mockResolvedValue({
      agent_id: "agent_1",
      node_id: "node_1",
      session_id: "sess_archived",
    });
    renderOverview();

    await user.click(
      await screen.findByRole("button", { name: "Restore Archived session" }),
    );

    await waitFor(() =>
      expect(mocks.updateAgentSession).toHaveBeenCalledWith(
        "user_1",
        "node_1",
        "agent_1",
        "sess_archived",
        { archived: false },
      ),
    );
  });

  it("shows projects and recent sessions in one unified rail", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Inbox" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeVisible();
    expect(screen.getByText("Recents")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute(
      "href",
      "/settings/projects",
    );
    expect(screen.getByRole("button", { name: "Pax" })).toBeVisible();
    expect(
      await screen.findByRole("link", { name: /Session one/ }),
    ).toBeVisible();
  });

  it("marks encrypted sessions without crowding the session title", async () => {
    mocks.listUserSessions.mockResolvedValue({
      pagination: { page_num: 1, page_size: 20, total: 1, total_pages: 1 },
      sessions: [
        {
          agent_id: "agent_1",
          name: "Private session",
          node_id: "node_1",
          session_id: "sess_encrypted",
          transport: "e2ee",
          updated_at: "2026-08-08T12:00:00.000Z",
        },
      ],
    });
    renderOverview();

    const sessionLink = await screen.findByRole("link", {
      name: /Private session/,
    });
    expect(
      within(sessionLink).getByRole("img", {
        name: "End-to-end encrypted",
      }),
    ).toBeVisible();
    expect(
      within(sessionLink).queryByText("Encrypted"),
    ).not.toBeInTheDocument();

    fireEvent.click(sessionLink);
    expect(await screen.findByTestId("session-workbench")).toHaveTextContent(
      "sess_encrypted",
    );
    expect(window.location.search).toBe("?session_id=sess_encrypted");
  });

  it("shows subprojects before sessions at every project nesting level", async () => {
    const rootProject = projectFixture("project_root", "Root project");
    const childProject = projectFixture(
      "project_child",
      "Child project",
      rootProject.project_id,
    );
    const grandchildProject = projectFixture(
      "project_grandchild",
      "Grandchild project",
      childProject.project_id,
    );
    setProjectContents(
      [rootProject, childProject, grandchildProject],
      [
        sessionFixture("sess_root", "Root session", rootProject.project_id),
        sessionFixture("sess_child", "Child session", childProject.project_id),
      ],
    );

    renderOverview();

    expect(
      screen.getByRole("button", { name: "Child project" }),
    ).toAppearBefore(await screen.findByRole("link", { name: /Root session/ }));
    expect(
      screen.getByRole("button", { name: "Grandchild project" }),
    ).toAppearBefore(screen.getByRole("link", { name: /Child session/ }));
  });

  it("renders a project with sessions and no subprojects without extra contents", async () => {
    const project = projectFixture("project_root", "Sessions only project");
    setProjectContents(
      [project],
      [sessionFixture("sess_root", "Only session", project.project_id)],
    );

    renderOverview();

    expect(
      await screen.findByRole("link", { name: /Only session/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Child project" }),
    ).not.toBeInTheDocument();
  });

  it("renders a project with subprojects and no sessions without extra contents", async () => {
    const rootProject = projectFixture(
      "project_root",
      "Subprojects only project",
    );
    const childProject = projectFixture(
      "project_child",
      "Child project",
      rootProject.project_id,
    );
    setProjectContents([rootProject, childProject], []);

    renderOverview();

    expect(screen.getByRole("button", { name: "Child project" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Only session/ }),
    ).not.toBeInTheDocument();
  });

  it("renders a project with no sessions or subprojects without a project placeholder", async () => {
    const project = projectFixture("project_root", "Empty project");
    setProjectContents([project], []);

    renderOverview();

    const projectRow = screen
      .getByRole("button", { name: "Empty project" })
      .closest("div");
    const projectContents = projectRow?.parentElement;
    expect(projectContents?.nextElementSibling).toHaveTextContent("Recents");
  });

  it("starts a project session through the normal Home composer", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Pax" }));
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue(
      "project_1",
    );
    expect(
      screen.getByRole("button", { name: "Change workspace" }),
    ).toHaveTextContent("~/pax");
    const composer = screen.getByPlaceholderText(
      "Ask an agent to do something",
    );
    await userEvent.type(composer, "Work on KEV-8");
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("new");
    expect(workbench).toHaveAttribute("data-node-id", "node_1");
    expect(workbench).toHaveAttribute("data-agent-id", "agent_1");
    expect(workbench).toHaveAttribute("data-primary-project-id", "project_1");
    expect(workbench).toHaveAttribute("data-project-target-id", "target_1");
    expect(workbench).toHaveAttribute("data-initial-cwd", "~/pax");
    expect(workbench).toHaveAttribute(
      "data-initial-permission-choice-id",
      "pax:manual",
    );
    expect(window.location.search).toBe("");
  });

  it("starts an encrypted session from the normal Home composer", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("link", { name: "New session" }));

    const composerPane = screen.getByTestId("home-composer-pane");
    const encryptedToggle = screen.getByRole("button", {
      name: "Use end-to-end encryption",
    });
    expect(composerPane).toHaveAttribute("data-secure-mode", "false");
    expect(screen.getByLabelText("Project")).toBeVisible();
    expect(encryptedToggle).toHaveAttribute("aria-pressed", "false");
    expect(encryptedToggle).not.toHaveTextContent("Encrypted");
    expect(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    ).toBeVisible();
    await userEvent.click(encryptedToggle);
    expect(composerPane).toHaveAttribute("data-secure-mode", "true");
    expect(encryptedToggle).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "End-to-end encryption on",
    );
    expect(
      screen.getByRole("status", { name: "Session secured" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("secure-activation-animation"),
    ).toBeInTheDocument();
    expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();

    const composer = screen.getByPlaceholderText(
      "Send an end-to-end encrypted message",
    );
    await userEvent.type(composer, "Keep this private");
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("new");
    expect(workbench).toHaveAttribute("data-initial-transport", "e2ee");
    expect(workbench).toHaveAttribute(
      "data-initial-prompt",
      "Keep this private",
    );
  });

  it("clears encrypted draft UI when switching to an existing session", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("link", { name: "New session" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Use end-to-end encryption" }),
    );
    expect(screen.getByTestId("home-composer-pane")).toHaveAttribute(
      "data-secure-mode",
      "true",
    );

    await userEvent.click(
      await screen.findByRole("link", { name: /Session one/ }),
    );

    expect(screen.getByTestId("home-composer-pane")).toHaveAttribute(
      "data-secure-mode",
      "false",
    );
    expect(
      screen.queryByRole("status", { name: "Session secured" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("session-workbench")).toHaveTextContent("sess_1");
  });

  it("abandons encrypted intent when returning to a clean composer", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("link", { name: "New session" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Use end-to-end encryption" }),
    );
    await userEvent.click(
      await screen.findByRole("link", { name: /Session one/ }),
    );
    await userEvent.click(screen.getByRole("link", { name: "New session" }));

    expect(
      screen.getByRole("button", { name: "Use end-to-end encryption" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("home-composer-pane")).toHaveAttribute(
      "data-secure-mode",
      "false",
    );
  });

  it("keeps every new-session control usable in responsive composer rows", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("link", { name: "New session" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Set workspace" }),
    );

    const project = screen.getByRole("combobox", { name: "Project" });
    const workspace = screen.getByRole("textbox", { name: "Workspace" });
    expect(project).toBeVisible();
    expect(workspace).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload files" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Use end-to-end encryption" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Start session" })).toBeVisible();
  });

  it("starts empty session initialization from the Home advanced menu", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("link", { name: "New session" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Advanced session actions" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Create empty session/ }),
    );

    expect(await screen.findByTestId("session-workbench")).toHaveAttribute(
      "data-initial-initialize-only",
      "true",
    );
  });

  it.skipIf(!process.env.PAX_BROWSER_TESTS)(
    "fits resolved and missing workspace controls on phone and desktop",
    async () => {
      const { createRequire } = await import("node:module");
      const { readFile } = await import("node:fs/promises");
      const { chromium } = await import("playwright");
      const { default: tailwind } = await import("@tailwindcss/postcss");
      const require = createRequire(import.meta.url);
      const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
        "postcss",
      );
      const cssPath = `${process.cwd()}/src/app/globals.css`;
      const css = await postcss([tailwind()]).process(
        await readFile(cssPath, "utf8"),
        { from: cssPath },
      );
      renderOverview();
      await userEvent.selectOptions(
        await screen.findByRole("combobox", { name: "Project" }),
        "project_1",
      );
      const form = () =>
        screen
          .getByPlaceholderText("Ask an agent to do something")
          .closest("form")!.outerHTML;
      const resolved = form();
      await userEvent.click(
        screen.getByRole("button", { name: "Change workspace" }),
      );
      await userEvent.clear(screen.getByRole("textbox", { name: "Workspace" }));
      const missing = form();
      const browser = await chromium.launch({
        executablePath: process.env.PAX_TEST_CHROMIUM_PATH || undefined,
      });
      try {
        for (const width of [320, 390, 768, 1280]) {
          const page = await browser.newPage({
            viewport: { width, height: 844 },
            hasTouch: width < 640,
          });
          for (const [state, html] of [
            ["resolved", resolved],
            ["missing", missing],
          ]) {
            await page.setContent(
              `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style>${html}`,
            );
            await page
              .getByRole("combobox", { name: "Project" })
              .selectOption("project_1");
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            for (const control of await page
              .locator(
                'form button, form select, form textarea, form input:not([type="file"])',
              )
              .all()) {
              const bounds = await control.boundingBox();
              if (bounds) {
                expect(bounds.x).toBeGreaterThanOrEqual(0);
                expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
              }
            }
            if (width === 390 && process.env.PAX_LAYOUT_SCREENSHOT_DIR) {
              await page.locator("form").screenshot({
                path: `${process.env.PAX_LAYOUT_SCREENSHOT_DIR}/home-${state}.png`,
              });
            }
          }
          await page.close();
        }
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it("uses the matching default workspace without requiring input or saving a duplicate", async () => {
    renderOverview();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    expect(
      screen.queryByRole("textbox", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change workspace" }),
    ).toHaveTextContent("~/pax");
    await userEvent.type(
      screen.getByPlaceholderText("Ask an agent to do something"),
      "Continue project",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start session" }),
    );
    expect(await screen.findByTestId("session-workbench")).toHaveAttribute(
      "data-project-target-id",
      "target_1",
    );
    expect(screen.getByTestId("session-workbench")).toHaveAttribute(
      "data-initial-cwd",
      "~/pax",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Assign native session" }),
    );
    expect(mocks.createProjectTarget).not.toHaveBeenCalled();
  });

  it("does not carry an unbound directory into a selected project", async () => {
    mocks.useProjectTargets.mockReturnValue({
      data: { targets: [] },
      isPending: false,
    });
    renderOverview();
    await userEvent.click(
      await screen.findByRole("button", { name: "Set workspace" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Workspace" }),
      "~/temporary",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Project" }),
      "project_1",
    );
    expect(screen.getByRole("textbox", { name: "Workspace" })).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Workspace" }),
      "~/new-project",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Ask an agent to do something"),
      "Start here",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start session" }),
    );
    expect(await screen.findByTestId("session-workbench")).toHaveAttribute(
      "data-initial-cwd",
      "~/new-project",
    );
  });

  it("clears the workspace for an unbound agent and offers the configured agent", async () => {
    mocks.listAgents.mockResolvedValue({
      agents: [
        {
          agent_id: "agent_1",
          name: "Pi agent",
          node_id: "node_1",
          online: true,
        },
        {
          agent_id: "agent_2",
          name: "Second agent",
          node_id: "node_2",
          online: true,
        },
      ],
    });
    renderOverview();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Pi agent" }));
    await userEvent.click(screen.getByRole("button", { name: "Second agent" }));
    expect(screen.getByRole("textbox", { name: "Workspace" })).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Use a configured agent" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Pi agent.*pax/ }),
    );
    expect(
      screen.getByRole("button", { name: "Change workspace" }),
    ).toHaveTextContent("~/pax");
    await userEvent.type(
      screen.getByPlaceholderText("Ask an agent to do something"),
      "Use saved location",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start session" }),
    );
    expect(await screen.findByTestId("session-workbench")).toHaveAttribute(
      "data-agent-id",
      "agent_1",
    );
    expect(screen.getByTestId("session-workbench")).toHaveAttribute(
      "data-project-target-id",
      "target_1",
    );
  });

  it("asks for a workspace when several match the agent without a default", async () => {
    mocks.useProjectTargets.mockReturnValue({
      data: {
        targets: [
          {
            target_id: "one",
            project_id: "project_1",
            agent_id: "agent_1",
            cwd: "~/one",
            enabled: true,
            is_default: false,
          },
          {
            target_id: "two",
            project_id: "project_1",
            agent_id: "agent_1",
            cwd: "~/two",
            enabled: true,
            is_default: false,
          },
          {
            target_id: "disabled",
            project_id: "project_1",
            agent_id: "agent_1",
            cwd: "~/disabled",
            enabled: false,
            is_default: true,
          },
        ],
      },
      isPending: false,
    });
    renderOverview();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    expect(screen.getByRole("textbox", { name: "Workspace" })).toHaveValue("");
    await userEvent.click(
      screen.getByRole("button", { name: "Saved workspaces" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: /disabled/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /two/ }));
    expect(
      screen.getByRole("button", { name: "Change workspace" }),
    ).toHaveTextContent("~/two");
  });

  it("allows choosing a saved location while editing a nonempty directory", async () => {
    renderOverview();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change workspace" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Workspace" }),
      "-other",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Saved workspaces" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /pax/ }));
    expect(
      screen.getByRole("button", { name: "Change workspace" }),
    ).toHaveTextContent("~/pax");
    expect(
      screen.queryByRole("textbox", { name: "Workspace" }),
    ).not.toBeInTheDocument();
  });

  it("waits for project bindings before allowing a session to start", async () => {
    mocks.useProjectTargets.mockReturnValue({
      data: undefined,
      isPending: true,
    });
    renderOverview();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    expect(screen.getByText("Loading workspaces…")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeDisabled();
  });

  it("creates a target for a new project workspace only after native session assignment", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "project_1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change workspace" }),
    );
    await userEvent.clear(screen.getByLabelText("Workspace"));
    await userEvent.type(
      screen.getByLabelText("Workspace"),
      "~/worktrees/kev-8",
    );
    const composer = screen.getByPlaceholderText(
      "Ask an agent to do something",
    );
    const submit = composer
      .closest("form")!
      .querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit).toBeEnabled();
    await userEvent.type(composer, "Work on KEV-8");
    await userEvent.click(submit);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).not.toHaveAttribute("data-project-target-id");
    expect(workbench).toHaveAttribute("data-initial-cwd", "~/worktrees/kev-8");
    expect(mocks.createProjectTarget).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Assign native session" }),
    );
    await waitFor(() =>
      expect(mocks.createProjectTarget).toHaveBeenCalledWith(
        "user_1",
        "project_1",
        {
          agent_id: "agent_1",
          cwd: "~/worktrees/kev-8",
        },
      ),
    );
  });

  it("keeps Home mounted and opens a selected session in the embedded workbench", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("link", { name: /Session one/ }));

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("sess_1");
    expect(workbench).toHaveAttribute("data-embedded", "true");
    expect(workbench).toHaveAttribute("data-node-id", "node_1");
    expect(workbench).toHaveAttribute("data-agent-id", "agent_1");
    expect(screen.getByText("Recents")).toBeVisible();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?session_id=sess_1");
    await waitFor(() => expect(mocks.routerPush).not.toHaveBeenCalled());
  });

  it.each(["session_id", "sessionId"])(
    "opens a directly linked %s in the Home workbench",
    async (parameter) => {
      window.history.replaceState(null, "", `/?${parameter}=sess_1`);

      renderOverview();

      const workbench = await screen.findByTestId("session-workbench");
      expect(workbench).toHaveTextContent("sess_1");
      expect(workbench).toHaveAttribute("data-embedded", "true");
      expect(workbench).toHaveAttribute("data-node-id", "node_1");
      expect(workbench).toHaveAttribute("data-agent-id", "agent_1");
      expect(window.location.search).toBe("?session_id=sess_1");
      expect(window.location.pathname).toBe("/");
    },
  );

  it("leaves command-click navigation to the Home session link", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const sessionLink = await screen.findByRole("link", {
      name: /Session one/,
    });

    expect(sessionLink).toHaveAttribute("href", "/?session_id=sess_1");
    let componentPreventedNavigation = true;
    const preventJsdomNavigation = (event: MouseEvent) => {
      componentPreventedNavigation = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", preventJsdomNavigation);
    fireEvent.click(sessionLink, { metaKey: true });
    document.removeEventListener("click", preventJsdomNavigation);

    expect(componentPreventedNavigation).toBe(false);
    expect(screen.queryByTestId("session-workbench")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("keeps an ordinary new session click inside Home", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("link", { name: /Session one/ }));
    expect(await screen.findByTestId("session-workbench")).toHaveTextContent(
      "sess_1",
    );

    const newSessionLink = screen.getByRole("link", { name: "New session" });
    expect(fireEvent.click(newSessionLink)).toBe(false);

    expect(screen.queryByTestId("session-workbench")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("leaves command-click navigation to the canonical new session link", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const newSessionLink = await screen.findByRole("link", {
      name: "New session",
    });

    expect(newSessionLink).toHaveAttribute("href", "/sessions/new");
    let componentPreventedNavigation = true;
    const preventJsdomNavigation = (event: MouseEvent) => {
      componentPreventedNavigation = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", preventJsdomNavigation);
    fireEvent.click(newSessionLink, { metaKey: true });
    document.removeEventListener("click", preventJsdomNavigation);

    expect(componentPreventedNavigation).toBe(false);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("starts a new chat inside Home without navigating to the session route", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const composer = await screen.findByPlaceholderText(
      "Ask an agent to do something",
    );
    fireEvent.change(composer, {
      target: { value: "Keep this chat on Home" },
    });
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("new");
    expect(workbench).toHaveAttribute("data-embedded", "true");
    expect(workbench).toHaveAttribute(
      "data-initial-prompt",
      "Keep this chat on Home",
    );
    expect(screen.getByText("Recents")).toBeVisible();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("uploads files from the Home composer and forwards them to the new session", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const addButton = await screen.findByRole("button", {
      name: "Upload files",
    });
    expect(
      screen.queryByRole("menuitem", { name: "Upload" }),
    ).not.toBeInTheDocument();
    await userEvent.click(addButton);
    expect(
      screen.getByRole("menuitem", { name: "Upload" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Open artifacts")).not.toBeInTheDocument();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    );
    expect(fileInput).not.toBeNull();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(mocks.createUserAttachment).toHaveBeenCalledWith("user_1", {
      content_type: "text/plain",
      filename: "notes.txt",
      sha256: "",
      size_bytes: 5,
    });
    expect(mocks.uploadUserAttachmentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({ attachment_id: "att_1" }),
      }),
      file,
    );

    const composer = screen.getByPlaceholderText(
      "Ask an agent to do something",
    );
    fireEvent.change(composer, {
      target: { value: "Read the attachment" },
    });
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveAttribute("data-initial-attachments", "att_1");
    expect(workbench).toHaveAttribute(
      "data-initial-prompt",
      "Read the attachment",
    );
  });
});

function projectFixture(
  projectId: string,
  displayName: string,
  parentProjectId?: string,
): Project {
  return {
    created_at: "2026-07-20T12:00:00.000Z",
    display_name: displayName,
    owner_user_id: "user_1",
    parent_project_id: parentProjectId,
    project_id: projectId,
    updated_at: "2026-07-20T12:00:00.000Z",
  };
}

function sessionFixture(
  sessionId: string,
  name: string,
  primaryProjectId: string,
): AgentSession {
  return {
    agent_id: "agent_1",
    name,
    node_id: "node_1",
    primary_project_id: primaryProjectId,
    session_id: sessionId,
    updated_at: "2026-07-20T12:00:00.000Z",
  };
}

function setProjectContents(projects: Project[], sessions: AgentSession[]) {
  mocks.useProjects.mockReturnValue({
    data: { projects },
    error: null,
    isLoading: false,
  });
  mocks.listUserSessions.mockResolvedValue({
    pagination: {
      page_num: 1,
      page_size: 20,
      total: sessions.length,
      total_pages: sessions.length > 0 ? 1 : 0,
    },
    sessions,
  });
}

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FleetOverview user={{ user_id: "user_1" } as User} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function emptyQueryData(key: string) {
  return {
    data: { [key]: [] },
    error: null,
    isLoading: false,
  };
}
