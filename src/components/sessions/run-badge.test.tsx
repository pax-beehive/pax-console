/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RunBadge } from "./run-badge";

function renderBadge(
  status: Parameters<typeof RunBadge>[0]["status"],
  error: Error | null = null,
) {
  return render(
    <TooltipProvider>
      <RunBadge error={error} status={status} />
    </TooltipProvider>,
  );
}

describe("RunBadge", () => {
  it("opens the transient conversation error when the badge is clicked", () => {
    const error = new Error("backend SSE failed");
    error.name = "ConversationRunError";

    renderBadge("error", error);

    const trigger = screen.getByLabelText(
      "Session error: ConversationRunError: backend SSE failed",
    );
    const details = trigger.closest("details");

    expect(details).not.toHaveAttribute("open");
    fireEvent.click(trigger);
    expect(details).toHaveAttribute("open");
    expect(
      screen.getByText("ConversationRunError: backend SSE failed"),
    ).toBeInTheDocument();
  });

  it("falls back to a generic error when no detail is available", () => {
    renderBadge("error");

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Session error: The session stream failed."),
    ).toBeInTheDocument();
  });
});
