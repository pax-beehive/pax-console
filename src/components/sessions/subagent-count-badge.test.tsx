/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SubagentCountBadge } from "./subagent-count-badge";

describe("SubagentCountBadge", () => {
  it("shows the count and names it for assistive technology", () => {
    render(
      <TooltipProvider>
        <SubagentCountBadge count={2} />
      </TooltipProvider>,
    );

    const badge = screen.getByRole("button", { name: "2 subagents running" });
    expect(badge).toHaveTextContent("2");
  });

  it("renders nothing while no subagent runs", () => {
    const { container } = render(
      <TooltipProvider>
        <SubagentCountBadge count={0} />
      </TooltipProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
