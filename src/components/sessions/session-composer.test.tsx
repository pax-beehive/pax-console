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
});
