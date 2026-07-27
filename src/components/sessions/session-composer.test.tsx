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
      screen.queryByRole("menuitem", { name: "Open artifacts" }),
    ).not.toBeInTheDocument();
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

  it("keeps artifact access in the shared add menu for admins", async () => {
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
});
