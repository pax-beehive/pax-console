/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileCollapsibleSessionHeader } from "./mobile-collapsible-session-header";
import { SessionWorkspaceDetails } from "./session-workspace-details";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("session workspace details", () => {
  const workspace =
    "/Users/demo/projects/a very long project/worktrees/mobile-layout";

  function renderDetails() {
    render(
      <TooltipProvider>
        <MobileCollapsibleSessionHeader
          summary="Mobile layout"
          details={<SessionWorkspaceDetails workspace={workspace} />}
        >
          <span>Agent details</span>
        </MobileCollapsibleSessionHeader>
      </TooltipProvider>,
    );
  }

  it("keeps the full immutable path in expandable details and copies it", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderDetails();
    await user.click(
      screen.getByRole("button", { name: "Expand session details" }),
    );
    expect(screen.getByTestId("session-details-panel")).toContainElement(
      screen.getByText(workspace),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Copy workspace path" }),
    );
    expect(copy).toHaveBeenCalledWith(workspace);
    expect(screen.getByRole("status")).toHaveTextContent("Workspace copied");
    await user.click(
      screen.getByRole("button", { name: "Collapse session details" }),
    );
    expect(screen.getByTestId("session-details-panel")).toHaveAttribute(
      "data-mobile-expanded",
      "false",
    );
  });

  it("leaves the path available for manual copying if clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    renderDetails();
    await user.click(
      screen.getByRole("button", { name: "Expand session details" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy workspace path" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Could not copy");
    expect(screen.getByText(workspace)).toBeInTheDocument();
  });
});
