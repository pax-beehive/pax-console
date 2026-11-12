/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useConsoleStore.setState({ composerDrafts: {} });
});

const props = {
  activeAgentId: "agent_1",
  activeNodeId: "node_1",
  approvalMode: "manual" as const,
  approvalModePending: false,
  attachmentError: null,
  attachmentUploadPending: false,
  attachments: [] as { attachmentId: string; filename: string }[],
  currentSessionId: "sess_running",
  deleteQueuedTurnPending: false,
  draftKey: "sess_running",
  isNewSession: false,
  isTurnRunning: true,
  newSessionCwdInvalid: false,
  onAddAttachments: async () => {},
  onDeleteQueuedTurn: () => {},
  onRemoveAttachment: () => {},
  onStop: () => {},
  onToggleApprovalMode: () => {},
  onUpdateQueuedTurn: async () => true,
  queueTurnPending: false,
  queuedTurn: null,
  steerTurnPending: false,
  stopTurnPending: false,
  updateQueuedTurnPending: false,
};

const files = [{ attachmentId: "att_1", filename: "notes.txt" }];

describe("SessionComposer queued turns with files", () => {
  it("queues files while a turn runs, even without text", async () => {
    const onSubmitDraft = vi.fn().mockResolvedValue(true);
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          attachments={files}
          onSteer={async () => true}
          onSubmitDraft={onSubmitDraft}
        />
      </TooltipProvider>,
    );
    expect(
      screen.queryByText(/Send when this turn finishes/),
    ).not.toBeInTheDocument();
    const queue = screen.getByRole("button", {
      name: "Queue after current turn",
    });
    expect(queue).toBeEnabled();
    await userEvent.click(queue);
    expect(onSubmitDraft).toHaveBeenCalledWith("", expect.any(Function));
  });

  it("steers with files", async () => {
    const onSteer = vi.fn().mockResolvedValue(true);
    useConsoleStore
      .getState()
      .setComposerDraft("sess_running", "use this file instead");
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          attachments={files}
          onSteer={onSteer}
          onSubmitDraft={async () => true}
        />
      </TooltipProvider>,
    );
    const steer = screen.getByRole("button", {
      name: "Steer with this prompt",
    });
    expect(steer).toBeEnabled();
    await userEvent.click(steer);
    expect(onSteer).toHaveBeenCalledWith("use this file instead");
  });

  it("lists the files of the queued turn", () => {
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          onSteer={async () => true}
          onSubmitDraft={async () => true}
          queuedTurn={{
            agent_id: "agent_1",
            attachments: [
              { attachment_id: "att_1", filename: "notes.txt" },
              { attachment_id: "att_2", filename: "shot.png" },
            ],
            command_id: "cmd_1",
            created_at: "2026-11-12T00:00:00Z",
            input: "",
            queued_turn_id: "queued_1",
            session_id: "sess_running",
            updated_at: "2026-11-12T00:00:00Z",
          }}
        />
      </TooltipProvider>,
    );
    const queuedFiles = screen.getByRole("group", { name: "Queued files" });
    expect(within(queuedFiles).getByText("notes.txt")).toBeVisible();
    expect(within(queuedFiles).getByText("shot.png")).toBeVisible();
  });
});
