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
import * as buttonModule from "@/components/ui/button";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";

class MockVisualViewport extends EventTarget {
  height = 900;
  offsetTop = 0;
}

const mockVisualViewport = new MockVisualViewport();
const scrollIntoViewMock = vi.fn();
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("visualViewport", mockVisualViewport);
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  });
});

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  } else {
    // @ts-expect-error jsdom may not define scrollIntoView by default.
    delete HTMLElement.prototype.scrollIntoView;
  }
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockVisualViewport.height = 900;
  mockVisualViewport.offsetTop = 0;
  scrollIntoViewMock.mockReset();
  useConsoleStore.setState({ composerDrafts: {} });
});

describe("SessionComposer", () => {
  it("offers empty-session creation as an advanced action and preserves the draft", async () => {
    const user = userEvent.setup();
    const onCreateEmptySession = vi.fn().mockResolvedValue(true);
    useConsoleStore.getState().setComposerDraft("new", "unsent draft");

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
          createEmptySessionPending={false}
          deleteQueuedTurnPending={false}
          draftKey="new"
          isNewSession
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onCreateEmptySession={onCreateEmptySession}
          onDeleteQueuedTurn={vi.fn()}
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

    await user.click(
      screen.getByRole("button", { name: "Advanced session actions" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: /Create empty session/ }),
    );

    expect(onCreateEmptySession).toHaveBeenCalledOnce();
    expect(useConsoleStore.getState().composerDrafts.new).toBe("unsent draft");
  });

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
    expect(screen.getByRole("button", { name: "Upload files" })).toBeDisabled();
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

  it("lets the shell resize for the keyboard without padding or document scrolling", async () => {
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

    const textarea = screen.getByPlaceholderText("Send a prompt to this agent");
    const form = textarea.closest("form") as HTMLFormElement;
    expect(textarea).toHaveClass("text-base", "sm:text-sm");
    expect(textarea).toHaveAttribute("enterkeyhint", "send");
    fireEvent.focus(textarea);
    mockVisualViewport.height = 856;
    mockVisualViewport.dispatchEvent(new Event("resize"));
    expect(form.style.paddingBottom).toBe("");
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("updates its draft without rerendering sibling timeline content", async () => {
    const renderButton = vi.spyOn(buttonModule, "Button");
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
    const addButton = screen.getByRole("button", { name: "Upload files" });
    expect(
      screen.queryByRole("menuitem", { name: "Upload" }),
    ).not.toBeInTheDocument();
    await userEvent.click(addButton);
    expect(
      screen.getByRole("menuitem", { name: "Upload" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Open artifacts")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Voice input is not available yet"),
    ).not.toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "hello" } });

    expect(textarea).toHaveValue("hello");
    expect(timelineRenderCount).toBe(1);

    const controlRenderCount = renderButton.mock.calls.length;
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(renderButton).toHaveBeenCalledTimes(controlRenderCount);
    fireEvent.submit(textarea.closest("form")!);
    expect(onSubmitDraft).toHaveBeenCalledWith("hello world");
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(timelineRenderCount).toBe(1);
  });

  it("renders auto approve as an icon toggle with an explanation", async () => {
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

    const approvalToggle = screen.getByRole("button", {
      name: "Ask before running tools",
    });
    expect(approvalToggle).toHaveAttribute("aria-pressed", "false");
    expect(approvalToggle).not.toHaveTextContent("Ask before tools");
    await userEvent.click(approvalToggle);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Ask before running tools",
    );
  });

  it("keeps running-turn actions and secure secret delivery available", async () => {
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
          isTurnRunning
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
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
          userId="user_1"
          secure
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Ask before running tools" }),
    ).not.toHaveTextContent("Ask before tools");
    expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Queue after current turn" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Steer with this prompt" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Stop current turn" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "More turn actions" }),
    ).toHaveClass("sm:hidden");
    expect(
      screen.getByRole("button", { name: "Steer with this prompt" }),
    ).toHaveClass("hidden", "sm:inline-flex");
    expect(
      screen.queryByRole("button", { name: "Send prompt" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Add to conversation" }),
    );
    expect(screen.getByRole("menuitem", { name: "Upload" })).toHaveAttribute(
      "data-disabled",
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Securely send password / token" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Target node: node_1");
    await userEvent.type(screen.getByLabelText("Secret value"), "not-for-chat");
    expect(
      JSON.stringify(useConsoleStore.getState().composerDrafts),
    ).not.toContain("not-for-chat");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("Secret value")).not.toBeInTheDocument();
  });

  it("shows the unified permission catalog for existing sessions", async () => {
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
          currentSessionId="sess_1"
          draftKey="sess_1"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
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
  it("completes commands in the queued-message editor without sending the main draft", async () => {
    const onSubmitDraft = vi.fn().mockResolvedValue(true);
    const onUpdateQueuedTurn = vi.fn().mockResolvedValue(true);
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
          currentSessionId="sess_1"
          draftKey="sess_1"
          isNewSession={false}
          isTurnRunning
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSelectPermissionChoice={vi.fn()}
          onSetNewSessionCwd={vi.fn()}
          onSetNewSessionWorkspaceOpen={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={onSubmitDraft}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={onUpdateQueuedTurn}
          queueTurnPending={false}
          availableCommands={[
            {
              name: "review-branch",
              description: "Review branch",
              input: { hint: "branch name" },
            },
          ]}
          queuedTurn={{
            agent_id: "agent_1",
            command_id: "cmd_1",
            created_at: "2026-09-07T00:00:00Z",
            updated_at: "2026-09-07T00:00:00Z",
            input: "/re",
            queued_turn_id: "queued_1",
            session_id: "sess_1",
          }}
          showAdminFeatures={false}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit queued message" }),
    );
    const input = screen.getByRole("textbox", { name: "Queued message" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveValue("/review-branch ");
    expect(onUpdateQueuedTurn).not.toHaveBeenCalled();
    expect(onSubmitDraft).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "/review-branch main" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onUpdateQueuedTurn).toHaveBeenCalledWith("/review-branch main"),
    );
  });
});
