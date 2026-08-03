/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionRuntimeActions } from "./session-runtime-actions";

afterEach(cleanup);

describe("SessionRuntimeActions", () => {
  it("warns that resetting stale display status does not cancel the task", async () => {
    const user = userEvent.setup();
    renderActions(vi.fn());

    await user.click(screen.getByRole("button", { name: "Session actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Reset stale status" }),
    );

    expect(
      screen.getByText(/does not cancel or terminate the underlying task/i),
    ).toBeInTheDocument();
  });

  it("resets only after explicit confirmation", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    renderActions(onReset);

    await user.click(screen.getByRole("button", { name: "Session actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Reset stale status" }),
    );
    expect(onReset).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reset status" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

function renderActions(onReset: () => void) {
  return render(
    <TooltipProvider>
      <SessionRuntimeActions canReset isPending={false} onReset={onReset} />
    </TooltipProvider>,
  );
}
