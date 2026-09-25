/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspacePicker } from "./workspace-picker";
afterEach(cleanup);
function picker(onChange = vi.fn()) {
  render(
    <TooltipProvider>
      <WorkspacePicker
        value="~/current"
        targets={[{ target_id: "one", cwd: "~/saved" }]}
        save={false}
        canSave
        onChange={onChange}
      />
    </TooltipProvider>,
  );
  return onChange;
}
it("separates saved selection from manual entry and only commits a valid path on Use", async () => {
  const change = picker();
  await userEvent.click(
    screen.getByRole("button", { name: "Choose workspace" }),
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Enter a path" }));
  const input = screen.getByRole("textbox", { name: "Workspace" });
  await userEvent.clear(input);
  await userEvent.type(input, "relative/path");
  expect(screen.getByRole("button", { name: "Use this path" })).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
  await userEvent.clear(input);
  await userEvent.type(input, "~/new");
  expect(
    screen.getByRole("checkbox", { name: "Save as workspace target" }),
  ).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Use this path" }));
  expect(change).toHaveBeenCalledWith("~/new", false);
});
it("never saves an existing target even after editing the save intent", async () => {
  const change = picker();
  await userEvent.click(
    screen.getByRole("button", { name: "Choose workspace" }),
  );
  await userEvent.click(screen.getByRole("tab", { name: "Enter a path" }));
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Save as workspace target" }),
  );
  await userEvent.click(screen.getByRole("tab", { name: "Saved workspaces" }));
  await userEvent.click(screen.getByRole("button", { name: "~/saved" }));
  expect(change).toHaveBeenCalledWith("~/saved", false);
});
