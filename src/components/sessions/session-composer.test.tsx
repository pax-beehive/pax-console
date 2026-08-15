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
  mockVisualViewport.height = 900;
  mockVisualViewport.offsetTop = 0;
  scrollIntoViewMock.mockReset();
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

  it("uses touch-friendly composer sizing and lifts itself above the mobile keyboard", async () => {
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
    expect(form).toHaveStyle({
      paddingBottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 0px)",
    });

    fireEvent.focus(textarea);
    mockVisualViewport.height = 620;
    mockVisualViewport.dispatchEvent(new Event("resize"));

    await waitFor(() =>
      expect(form).toHaveStyle({
        paddingBottom:
          "calc(max(0.75rem, env(safe-area-inset-bottom)) + 280px)",
      }),
    );
    fireEvent.blur(textarea);

    await waitFor(() =>
      expect(form).toHaveStyle({
        paddingBottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 0px)",
      }),
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

    fireEvent.submit(textarea.closest("form")!);
    expect(onSubmitDraft).toHaveBeenCalledWith("hello");
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

  it("keeps running-turn actions as labelled icon controls", () => {
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
          readOnlyWorkspace="~/pax"
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
    expect(screen.getByText("~/pax").parentElement).toHaveClass(
      "basis-full",
      "sm:basis-auto",
    );
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
      screen.queryByRole("button", { name: "Send prompt" }),
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
