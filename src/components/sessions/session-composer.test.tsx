/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";

afterEach(() => {
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
          currentSessionId="sess_1"
          deleteQueuedTurnPending={false}
          draftKey="sess_1"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwd=""
          newSessionCwdInvalid={false}
          newSessionWorkspaceOpen={false}
          onDeleteQueuedTurn={vi.fn()}
          onOpenArtifacts={vi.fn()}
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
});
