/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SubagentCountBadge } from "./subagent-count-badge";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("shows only the count and explains the supplied activity label on tap", async () => {
    render(
      <TooltipProvider>
        <SubagentCountBadge count={2} label="2 sub agent active" />
      </TooltipProvider>,
    );

    const badge = screen.getByRole("button", { name: "2 sub agent active" });
    expect(badge).toHaveTextContent(/^2$/);
    expect(screen.queryByText("2 sub agent active")).not.toBeInTheDocument();

    fireEvent.click(badge);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "2 sub agent active",
    );
  });

  it("renders nothing while no subagent runs", () => {
    const { container } = render(
      <TooltipProvider>
        <SubagentCountBadge count={0} />
      </TooltipProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("hides a supplied activity label when its count reaches zero", () => {
    const { rerender } = render(
      <TooltipProvider>
        <SubagentCountBadge count={1} label="1 sub agent active" />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText("1 sub agent active")).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <SubagentCountBadge count={0} label="0 sub agent active" />
      </TooltipProvider>,
    );

    expect(screen.queryByLabelText(/sub agent active/)).not.toBeInTheDocument();
  });
});
