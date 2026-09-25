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
  it("creates an empty session immediately from send and suppresses repeated clicks", async () => {
    const user = userEvent.setup();
    const onCreateEmptySession = vi.fn().mockResolvedValue(true);

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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onCreateEmptySession={onCreateEmptySession}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
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

    await user.dblClick(screen.getByRole("button", { name: "Send prompt" }));

    expect(onCreateEmptySession).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Advanced session actions" }),
    ).not.toBeInTheDocument();
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
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
    expect(onSubmitDraft).toHaveBeenCalledWith(
      "hello world",
      expect.any(Function),
    );
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(timelineRenderCount).toBe(1);
  });

  it("renders and updates the fallback auto-approve switch", async () => {
    const onToggleApprovalMode = vi.fn();
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={async () => true}
          onToggleApprovalMode={onToggleApprovalMode}
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
      screen.getByRole("button", { name: "Session settings" }),
    );
    const approvalToggle = screen.getByRole("switch", {
      name: "Auto approve tools",
    });
    expect(approvalToggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(approvalToggle);
    expect(onToggleApprovalMode).toHaveBeenCalledOnce();
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
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
      screen.getByRole("button", { name: "Session settings" }),
    ).toBeVisible();
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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSelectPermissionChoice={onSelectPermissionChoice}
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
      screen.getByRole("button", { name: "Session settings" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Workspace access",
      }),
    );
    expect(screen.getByText("Agent permissions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Full access" }));

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
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSelectPermissionChoice={vi.fn()}
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

const creationProps = {
  activeAgentId: "agent_1",
  activeNodeId: "node_1",
  approvalMode: "manual" as const,
  approvalModePending: false,
  attachmentError: null,
  attachmentUploadPending: false,
  attachments: [],
  deleteQueuedTurnPending: false,
  draftKey: "new",
  isNewSession: true,
  isTurnRunning: false,
  newSessionCwdInvalid: false,
  onAddAttachments: async () => {},
  onDeleteQueuedTurn: () => {},
  onRemoveAttachment: () => {},
  onSteer: async () => true,
  onStop: () => {},
  onSubmitDraft: async () => true,
  onToggleApprovalMode: () => {},
  onUpdateQueuedTurn: async () => true,
  queueTurnPending: false,
  queuedTurn: null,
  showAdminFeatures: false,
  steerTurnPending: false,
  stopTurnPending: false,
  updateQueuedTurnPending: false,
};
it("blocks another empty creation for the entire pending request, then allows retry", async () => {
  let finish!: (value: boolean) => void;
  const create = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  render(
    <TooltipProvider>
      <SessionComposer {...creationProps} onCreateEmptySession={create} />
    </TooltipProvider>,
  );
  const send = screen.getByRole("button", { name: "Send prompt" });
  fireEvent.click(send);
  expect(create).toHaveBeenCalledTimes(1);
  now.mockReturnValue(2000);
  fireEvent.click(send);
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  fireEvent.click(send);
  expect(create).toHaveBeenCalledTimes(2);
  await act(async () => finish(true));
});
it("retains a rejected creation draft and does not let rapid Enter and send duplicate it", async () => {
  let finish!: (value: boolean) => void;
  const submit = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  useConsoleStore.getState().setComposerDraft("new", "Keep my work");
  render(
    <TooltipProvider>
      <SessionComposer {...creationProps} onSubmitDraft={submit} />
    </TooltipProvider>,
  );
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(submit).toHaveBeenCalledWith("Keep my work", expect.any(Function));
  await act(async () => finish(false));
  expect(input).toHaveValue("Keep my work");
});
it("does not initialize or send an empty prompt to an existing session", () => {
  const submit = vi.fn();
  const create = vi.fn();
  render(
    <TooltipProvider>
      <SessionComposer
        {...creationProps}
        isNewSession={false}
        currentSessionId="existing"
        onSubmitDraft={submit}
        onCreateEmptySession={create}
      />
    </TooltipProvider>,
  );
  expect(screen.getByRole("button", { name: "Send prompt" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(submit).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("clears an acknowledged prompt before completion and still allows queueing the next turn", async () => {
  let finish!: (accepted: boolean) => void;
  const submit = vi.fn((_content: string, onAccepted?: () => void) => {
    onAccepted?.();
    return new Promise<boolean>((resolve) => {
      finish = resolve;
    });
  });
  useConsoleStore.getState().setComposerDraft("new", "First turn");
  const view = (running: boolean) => (
    <TooltipProvider>
      <SessionComposer
        {...creationProps}
        currentSessionId={running ? "assigned" : undefined}
        isNewSession={!running}
        isTurnRunning={running}
        onSubmitDraft={submit}
      />
    </TooltipProvider>
  );
  const { rerender } = render(view(false));
  fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  const finishFirst = finish;
  rerender(view(true));
  await userEvent.type(screen.getByRole("textbox"), "Next turn");
  fireEvent.click(
    screen.getByRole("button", { name: "Queue after current turn" }),
  );
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenLastCalledWith("Next turn", expect.any(Function));
  await userEvent.type(screen.getByRole("textbox"), "Still writing");
  await act(async () => {
    finishFirst(true);
    finish(true);
  });
  expect(screen.getByRole("textbox")).toHaveValue("Still writing");
});
