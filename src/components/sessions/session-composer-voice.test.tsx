/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FakeVoiceSocket } from "@/features/voice/test-fakes";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";

const microphone = vi.hoisted(() => ({ stop: () => {} }));

vi.mock("@/features/voice/microphone", () => ({
  startMicrophone: async () => ({
    sampleRate: 16_000,
    stop: () => microphone.stop(),
  }),
}));

const sockets: FakeVoiceSocket[] = [];

beforeEach(() => {
  sockets.length = 0;
  vi.stubGlobal(
    "WebSocket",
    class extends FakeVoiceSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    },
  );
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
  attachments: [],
  currentSessionId: "sess_voice",
  deleteQueuedTurnPending: false,
  draftKey: "sess_voice",
  isNewSession: false,
  isTurnRunning: false,
  newSessionCwdInvalid: false,
  onAddAttachments: async () => {},
  onDeleteQueuedTurn: () => {},
  onRemoveAttachment: () => {},
  onSteer: async () => true,
  onStop: () => {},
  onToggleApprovalMode: () => {},
  onUpdateQueuedTurn: async () => true,
  queueTurnPending: false,
  queuedTurn: null,
  steerTurnPending: false,
  stopTurnPending: false,
  updateQueuedTurnPending: false,
};

const ready = { type: "ready", provider: "fake", sample_rate: 16_000 };

async function startDictation() {
  await userEvent.click(screen.getByRole("button", { name: "Dictate" }));
  await waitFor(() => expect(sockets).toHaveLength(1));
  const socket = sockets[0];
  act(() => {
    socket.open();
    socket.receive(ready);
  });
  return socket;
}

describe("SessionComposer voice input", () => {
  it("shows the Mic only when the instance offers voice input", () => {
    const { rerender } = render(
      <TooltipProvider>
        <SessionComposer {...props} onSubmitDraft={async () => true} />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Dictate" }),
    ).not.toBeInTheDocument();
    rerender(
      <TooltipProvider>
        <SessionComposer
          {...props}
          onSubmitDraft={async () => true}
          voiceInput={{}}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Dictate" })).toBeEnabled();
  });

  it("writes dictation into the draft, holds sending, and stops with Escape", async () => {
    const onSubmitDraft = vi.fn().mockResolvedValue(true);
    useConsoleStore.getState().setComposerDraft("sess_voice", "");
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          getVoiceHints={() => ({ keywords: ["paxd"] })}
          onSubmitDraft={onSubmitDraft}
          voiceInput={{ maxDurationSeconds: 300 }}
        />
      </TooltipProvider>,
    );
    const socket = await startDictation();
    expect(socket.url).toMatch(/\/api\/v1\/user\/self\/voice\/stream$/);
    expect(socket.json()[0]).toEqual({ type: "start", keywords: ["paxd"] });
    expect(screen.getByRole("status", { name: "Recording" })).toBeVisible();

    act(() =>
      socket.receive({ type: "transcript", final: "", partial: "run the" }),
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("run the");
    expect(textarea).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmitDraft).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(socket.json().at(-1)).toEqual({ type: "stop" });
    expect(screen.getByText("Finishing…")).toBeVisible();

    act(() => socket.receive({ type: "done", final: "run the tests" }));
    expect(textarea).toHaveValue("run the tests");
    expect(textarea).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeVisible();
    expect(onSubmitDraft).not.toHaveBeenCalled();
  });

  it("anchors at the draft caret even with the queued-turn editor open", async () => {
    useConsoleStore.getState().setComposerDraft("sess_voice", "Please now");
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          isTurnRunning
          onSubmitDraft={async () => true}
          queuedTurn={{
            agent_id: "agent_1",
            command_id: "cmd_1",
            created_at: "2026-11-12T00:00:00Z",
            updated_at: "2026-11-12T00:00:00Z",
            input: "queued text",
            queued_turn_id: "queued_1",
            session_id: "sess_voice",
          }}
          voiceInput={{}}
        />
      </TooltipProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Edit queued message" }),
    );
    const [queuedEditor, draftInput] = screen.getAllByRole("textbox");
    expect(queuedEditor).toHaveValue("queued text");
    (draftInput as HTMLTextAreaElement).setSelectionRange(7, 7);
    const socket = await startDictation();
    act(() =>
      socket.receive({ type: "transcript", final: "", partial: "do it" }),
    );
    expect(draftInput).toHaveValue("Please do it now");
    expect(queuedEditor).toHaveValue("queued text");
  });

  it("keeps recognized text and explains a failure", async () => {
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          onSubmitDraft={async () => true}
          voiceInput={{}}
        />
      </TooltipProvider>,
    );
    const socket = await startDictation();
    act(() => {
      socket.receive({ type: "transcript", final: "half a", partial: "" });
      socket.receive({ type: "error", code: "provider_unavailable" });
    });
    expect(screen.getByRole("textbox")).toHaveValue("half a");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Voice input stopped");
    expect(alert).toHaveTextContent(
      "Speech recognition is unavailable right now",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss voice input error" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains why dictation is off in encrypted sessions", () => {
    render(
      <TooltipProvider>
        <SessionComposer
          {...props}
          onSubmitDraft={async () => true}
          secure
          voiceInput={{}}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", {
        name: "Voice input is off in encrypted sessions",
      }),
    ).toBeDisabled();
  });
});
