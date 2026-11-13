/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocaleStore } from "@/features/i18n/locale-store";
import {
  paxAutoApproveChoice,
  paxManualChoice,
} from "@/features/permissions/permission-catalog";
import type {
  SessionEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";
import { useConsoleStore } from "@/stores/console-store";
import { SessionComposer } from "./session-composer";
import { WorkstreamItemCard } from "./session-event-cards";
import { SessionPermissionSelector } from "./session-permission-selector";
import { SessionSettings } from "./session-settings";

function switchLanguage(locale: "en" | "zh-CN") {
  act(() => useLocaleStore.setState({ locale }));
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
  useConsoleStore.setState({ composerDrafts: {} });
});

describe("given an active session when the display language changes", () => {
  it("updates the composer controls, preserves the user's draft, and sends its original content", async () => {
    const submit = vi.fn().mockResolvedValue(true);
    useConsoleStore.setState({
      composerDrafts: { "sess-i18n": "Send prompt" },
    });
    render(
      <TooltipProvider>
        <SessionComposer
          activeAgentId="agent-i18n"
          activeNodeId="node-i18n"
          approvalMode="manual"
          approvalModePending={false}
          attachmentError={null}
          attachmentUploadPending={false}
          attachments={[]}
          currentSessionId="sess-i18n"
          deleteQueuedTurnPending={false}
          draftKey="sess-i18n"
          isNewSession={false}
          isTurnRunning={false}
          newSessionCwdInvalid={false}
          onAddAttachments={async () => undefined}
          onDeleteQueuedTurn={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSteer={async () => true}
          onStop={vi.fn()}
          onSubmitDraft={submit}
          onToggleApprovalMode={vi.fn()}
          onUpdateQueuedTurn={async () => true}
          queueTurnPending={false}
          queuedTurn={null}
          steerTurnPending={false}
          stopTurnPending={false}
          updateQueuedTurnPending={false}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();

    switchLanguage("zh-CN");

    expect(screen.getByPlaceholderText("向此智能体发送指令")).toHaveValue(
      "Send prompt",
    );
    expect(screen.getByRole("button", { name: "会话设置" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "发送指令" }));
    expect(submit).toHaveBeenCalledWith("Send prompt", expect.any(Function));
  });

  it("updates an open permissions panel and submits the unchanged choice ID", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SessionSettings>
          <SessionPermissionSelector
            choices={[
              paxAutoApproveChoice,
              paxManualChoice,
              { choice_id: "agent:full", kind: "agent", label: "Full access" },
            ]}
            value="pax:manual"
            onChange={onChange}
          />
        </SessionSettings>
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Session settings" }));
    await user.click(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    );

    switchLanguage("zh-CN");

    expect(screen.getByRole("dialog", { name: "权限" })).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /工具操作前询问/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Full access" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /自动批准（PAX）/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("pax:auto_approve");
    expect(screen.getByRole("dialog", { name: "会话设置" })).toBeVisible();
  });

  it("translates approval actions and outcomes without changing request content or protocol values", () => {
    const event: Extract<SessionEvent, { type: "permission_request" }> = {
      type: "permission_request",
      id: "request-i18n",
      requestId: "request-i18n",
      approvalId: "approval-i18n",
      sessionId: "sess-i18n",
      title: "Send prompt",
      description: "Read /tmp/project-notes.txt",
      options: [],
      createdAt: "2026-11-13T00:00:00Z",
    };
    const item: WorkstreamItem = { type: "event", id: event.id, event };
    const decision = {
      decisions: {},
      error: null,
      onDecision: vi.fn(),
      pending: false,
    };
    const view = render(
      <TooltipProvider>
        <WorkstreamItemCard item={item} permissionDecision={decision} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Allow once" })).toBeVisible();

    switchLanguage("zh-CN");

    expect(screen.getByText("Send prompt")).toBeVisible();
    expect(screen.getByText("Read /tmp/project-notes.txt")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "允许一次" }));
    expect(decision.onDecision).toHaveBeenCalledExactlyOnceWith(
      "approval-i18n",
      "allow_once",
    );
    view.rerender(
      <TooltipProvider>
        <WorkstreamItemCard
          item={item}
          permissionDecision={{
            ...decision,
            decisions: {
              "approval-i18n": {
                status: "approved",
                source: "user",
                decisionOption: "allow_once",
              },
            },
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("已由用户批准")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "允许一次" }),
    ).not.toBeInTheDocument();
  });
});
