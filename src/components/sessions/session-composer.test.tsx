/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";

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

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  useConsoleStore.setState({ composerDrafts: {} });
});

describe("SessionComposer", () => {
  it("renders the secured composer treatment for encrypted sessions", () => {
    render(
      <TooltipProvider>
        <SessionComposer
          activeAgentId="agent_1"
          activeNodeId="node_1"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          currentSessionId="sess_e2ee"
          deleteQueuedTurnPending={false}
          draftKey="sess_e2ee"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={async () => true}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          queueTurnPending={false}
          queuedTurn={null}
          secure
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          supportsQueuedTurns={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("form", { name: "Encrypted session composer" }),
    ).toHaveAttribute("data-secure-mode", "true");
    expect(screen.queryByText("End-to-end encrypted")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Send an end-to-end encrypted message"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add files or context" }),
    ).toBeDisabled();
  });

  it("keeps the new-session workspace input usable on desktop", () => {
    render(
      <TooltipProvider>
        <SessionComposer
          activeAgentId="agent_1"
          activeNodeId="node_1"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          deleteQueuedTurnPending={false}
          draftKey="new"
          isNewSession
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={async () => true}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          queueTurnPending={false}
          queuedTurn={null}
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText("Workspace").closest("label")).toHaveClass(
      "basis-full",
      "sm:min-w-64",
      "sm:max-w-96",
    );
  });

  it("updates its draft without rerendering sibling timeline content", async () => {
    let timelineRenderCount = 0;
    const onSubmitDraft = vi.fn(async () => true);

    function TimelineProbe() {
      timelineRenderCount += 1;
      return <div>timeline</div>;
    }

    render(
      <TooltipProvider>
        <TimelineProbe />
        <SessionComposer
          activeAgentId="agent_1"
          activeNodeId="node_1"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          currentSessionId="sess_1"
          deleteQueuedTurnPending={false}
          draftKey="sess_1"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={onSubmitDraft}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          queueTurnPending={false}
          queuedTurn={null}
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    const textarea = screen.getByPlaceholderText("Send a prompt to this agent");
    expect(screen.queryByLabelText("Open artifacts")).not.toBeInTheDocument();
    const addButton = screen.getByRole("button", {
      name: "Add files or context",
    });
    expect(
      screen.queryByRole("menuitem", { name: "Attach files" }),
    ).not.toBeInTheDocument();
    await userEvent.click(addButton);
    expect(
      screen.getByRole("menuitem", { name: "Attach files" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Open artifacts" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Voice input is not available yet"),
    ).not.toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "hello" } });

    expect(textarea).toHaveValue("hello");
    expect(timelineRenderCount).toBe(1);

    fireEvent.submit(textarea.closest("form")!);
    expect(onSubmitDraft).toHaveBeenCalledWith("hello");
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(timelineRenderCount).toBe(1);
  });

  it("opens artifacts from the shared add menu", async () => {
    const onOpenArtifacts = vi.fn();

    render(
      <TooltipProvider>
        <SessionComposer
          activeAgentId="agent_1"
          activeNodeId="node_1"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          currentSessionId="sess_1"
          deleteQueuedTurnPending={false}
          draftKey="sess_1"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={onOpenArtifacts}
          onRemoveAttachment={vi.fn()}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={async () => true}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          queueTurnPending={false}
          queuedTurn={null}
          showAdminFeatures
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Add files or context" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Attach files" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Open artifacts" }),
    );

    expect(onOpenArtifacts).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("menuitem", { name: "Open artifacts" }),
    ).not.toBeInTheDocument();
  });

  it("shows the unified permission catalog for new sessions", async () => {
    const onSelectPermissionChoice = vi.fn();

    render(
      <TooltipProvider>
        <SessionComposer
          activeAgentId="agent_1"
          activeNodeId="node_1"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          deleteQueuedTurnPending={false}
          draftKey="new:node_1:agent_1"
          isNewSession
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSelectPermissionChoice={onSelectPermissionChoice}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={async () => true}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          permissionCatalog={{
            catalog_revision: 2,
            choices: [],
            source: "profile",
            stale: false,
          }}
          permissionChoiceId="agent:workspace"
          permissionChoices={[
            {
              choice_id: "pax:auto_approve",
              kind: "pax",
              label: "Auto approve (PAX)",
            },
            {
              choice_id: "agent:workspace",
              description: "Allow edits inside the workspace.",
              kind: "agent",
              label: "Workspace access",
            },
            {
              choice_id: "agent:full-access",
              kind: "agent",
              label: "Full access",
            },
          ]}
          queueTurnPending={false}
          queuedTurn={null}
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Workspace access",
      }),
    );
    expect(screen.getByText("Agent permissions")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Full access" }),
    );

    expect(onSelectPermissionChoice).toHaveBeenCalledWith("agent:full-access");
    expect(
      screen.queryByRole("button", { name: "Ask before running tools" }),
    ).not.toBeInTheDocument();
  });
});
