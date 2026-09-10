/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/features/api/errors";
import { RunBadge } from "./run-badge";

afterEach(cleanup);

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
  it("keeps the running icon and label together on one line", () => {
    renderBadge("streaming");
    const label = screen.getByText("running");
    expect(label).toHaveClass("inline-flex", "whitespace-nowrap");
    expect(label.querySelector("svg")).not.toBeNull();
  });
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

  it("shows the backend HTTP status and message for an API error", () => {
    renderBadge("error", new ApiError("project is archived", 409, null));

    const trigger = screen.getByLabelText(
      "Session error: HTTP 409: project is archived",
    );
    fireEvent.click(trigger);

    expect(
      screen.getByText("HTTP 409: project is archived"),
    ).toBeInTheDocument();
  });

  it("shows an idle timeout as an inactive state instead of a red error", () => {
    const error = new Error("ACP request idle timed out: session/prompt");
    error.name = "ConversationRunError";

    renderBadge("error", error);

    expect(screen.getByText("inactive")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Session inactive: ConversationRunError: ACP request idle timed out: session/prompt",
      ),
    ).toBeInTheDocument();
  });

  it("renders an acknowledged cancellation as a terminal status", () => {
    renderBadge("cancelled");

    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.getByLabelText("Run cancelled")).toBeInTheDocument();
  });
});
