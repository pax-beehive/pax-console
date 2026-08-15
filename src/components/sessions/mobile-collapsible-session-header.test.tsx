/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileCollapsibleSessionHeader } from "./mobile-collapsible-session-header";

describe("MobileCollapsibleSessionHeader", () => {
  it("starts compact and lets the user expand and collapse the existing tools", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileCollapsibleSessionHeader summary="Session one">
          <span>Node and agent details</span>
        </MobileCollapsibleSessionHeader>
      </TooltipProvider>,
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand session details",
    });
    const panel = screen.getByTestId("session-details-panel");

    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("data-mobile-expanded", "false");

    await user.click(expandButton);

    expect(panel).toHaveAttribute("data-mobile-expanded", "true");

    await user.click(
      screen.getByRole("button", { name: "Collapse session details" }),
    );

    expect(panel).toHaveAttribute("data-mobile-expanded", "false");
  });
});
