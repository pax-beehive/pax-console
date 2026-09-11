/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBrowserWindow } from "./session-browser-window";
vi.mock("@/components/resources/node-browser-control", () => ({
  NodeBrowserViewer: ({ nodeId }: { nodeId: string }) => (
    <div>Watching {nodeId}</div>
  ),
}));
afterEach(cleanup);
it("opens a nonmodal preview with expand and close controls", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(
    <TooltipProvider>
      <input aria-label="Chat composer" />
      <SessionBrowserWindow nodeId="node-1" userId="user" onClose={close} />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("region", { name: "Session browser preview" }),
  ).toBeVisible();
  expect(screen.getByText("Watching node-1")).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Chat composer" }),
    "Continue working",
  );
  expect(screen.getByRole("textbox")).toHaveValue("Continue working");
  await user.click(
    screen.getByRole("button", { name: "Expand browser window" }),
  );
  expect(
    screen.getByRole("button", { name: "Restore browser window" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Close browser preview" }),
  );
  expect(close).toHaveBeenCalledOnce();
});
