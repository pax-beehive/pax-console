/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { SessionWorkspaceDetails } from "./session-workspace-details";
it("shows the immutable path once with no redundant actions", () => {
  const path =
    "/Users/demo/projects/a very long project/worktrees/mobile-layout";
  render(<SessionWorkspaceDetails workspace={path} />);
  expect(screen.getByText(path)).toBeVisible();
  expect(screen.getByText(path)).toHaveAttribute("title", path);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
