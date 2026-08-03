/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileSessionTabs } from "./mobile-session-tabs";

const items = [
  {
    runStatus: "running",
    sessionId: "sess_1",
    title: "Concurrency fix",
  },
  {
    runStatus: "waiting_approval",
    sessionId: "sess_2",
    title: "Android release",
  },
];

function renderTabs(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

afterEach(cleanup);

describe("MobileSessionTabs", () => {
  it("shows the open workset and switches sessions directly", () => {
    const onSelect = vi.fn();
    renderTabs(
      <MobileSessionTabs
        activeSessionId="sess_1"
        items={items}
        onDismiss={vi.fn()}
        onNewSession={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Concurrency fix" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status", { name: "Running" })).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Waiting for approval" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Android release" }));
    expect(onSelect).toHaveBeenCalledWith("sess_2");
  });

  it("closes only the local tab and can start a new session", () => {
    const onDismiss = vi.fn();
    const onNewSession = vi.fn();
    renderTabs(
      <MobileSessionTabs
        items={items}
        onDismiss={onDismiss}
        onNewSession={onNewSession}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Close Concurrency fix tab" }),
    );
    expect(onDismiss).toHaveBeenCalledWith("sess_1");
    fireEvent.click(screen.getByRole("button", { name: "Start new session" }));
    expect(onNewSession).toHaveBeenCalledOnce();
    expect(screen.queryByText(/archive/i)).not.toBeInTheDocument();
  });

  it("explains that closing a tab keeps the session running and offers undo", () => {
    const onUndoDismiss = vi.fn();
    renderTabs(
      <MobileSessionTabs
        dismissedTitle="Concurrency fix"
        items={items.slice(1)}
        onDismiss={vi.fn()}
        onNewSession={vi.fn()}
        onSelect={vi.fn()}
        onUndoDismiss={onUndoDismiss}
      />,
    );

    expect(
      screen.getByText("Closed Concurrency fix. Session keeps running."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndoDismiss).toHaveBeenCalledOnce();
  });

  it("prevents text selection and supports keyboard reordering", () => {
    const onReorder = vi.fn();
    renderTabs(
      <MobileSessionTabs
        items={items}
        onDismiss={vi.fn()}
        onNewSession={vi.fn()}
        onReorder={onReorder}
        onSelect={vi.fn()}
      />,
    );

    const firstTab = screen.getByRole("tab", { name: "Concurrency fix" });
    const tabSurface = firstTab.closest("[data-session-tab]");
    expect(tabSurface).toHaveClass("select-none");
    expect(
      fireEvent.contextMenu(tabSurface as HTMLElement),
    ).toBe(false);

    fireEvent.keyDown(firstTab, { altKey: true, key: "ArrowRight" });
    expect(onReorder).toHaveBeenCalledWith(["sess_2", "sess_1"]);
  });
});
