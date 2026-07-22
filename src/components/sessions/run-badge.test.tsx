/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
  it("exposes the transient conversation error in the status badge", () => {
    const error = new Error("backend SSE failed");
    error.name = "ConversationRunError";

    renderBadge("error", error);

    expect(screen.getByText("error · backend SSE failed")).toBeInTheDocument();
    expect(
      screen.getByLabelText("ConversationRunError: backend SSE failed"),
    ).toBeInTheDocument();
  });

  it("falls back to a generic error when no detail is available", () => {
    renderBadge("error");

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByLabelText("Run failed")).toBeInTheDocument();
  });
});
