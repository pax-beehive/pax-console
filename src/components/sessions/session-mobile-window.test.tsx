/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionMobileWindow } from "./session-mobile-window";

vi.mock("@/components/resources/node-mobile-control", () => ({
  NodeMobileViewer: ({
    nodeId,
    onPrepare,
    prepareDisabled,
  }: {
    nodeId: string;
    onPrepare?: () => Promise<boolean>;
    prepareDisabled?: boolean;
  }) => (
    <div>
      Phone device {nodeId}
      {onPrepare && (
        <button disabled={prepareDisabled} onClick={() => void onPrepare()}>
          Add instructions from session
        </button>
      )}
    </div>
  ),
}));
afterEach(cleanup);

it("keeps chat usable in a separate nonmodal phone surface with expand and close", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(
    <TooltipProvider>
      <input aria-label="Chat composer" />
      <SessionMobileWindow nodeId="node-1" userId="u" onClose={close} />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("region", { name: "Session Android preview" }),
  ).toBeVisible();
  expect(screen.getByText("Phone device node-1")).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Chat composer" }),
    "Continue working",
  );
  expect(screen.getByRole("textbox")).toHaveValue("Continue working");
  await user.click(
    screen.getByRole("button", { name: "Expand Android window" }),
  );
  expect(
    screen.getByRole("button", { name: "Restore Android window" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Close Android preview" }),
  );
  expect(close).toHaveBeenCalledOnce();
});

it("passes the current session's draft action and availability into the phone viewer", async () => {
  const user = userEvent.setup();
  const onPrepare = vi.fn().mockResolvedValue(true);
  const { rerender } = render(
    <TooltipProvider>
      <SessionMobileWindow
        nodeId="node-1"
        userId="u"
        onClose={vi.fn()}
        onPrepare={onPrepare}
        prepareDisabled
      />
    </TooltipProvider>,
  );
  expect(onPrepare).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Add instructions from session" }),
  ).toBeDisabled();
  rerender(
    <TooltipProvider>
      <SessionMobileWindow
        nodeId="node-1"
        userId="u"
        onClose={vi.fn()}
        onPrepare={onPrepare}
      />
    </TooltipProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "Add instructions from session" }),
  );
  expect(onPrepare).toHaveBeenCalledOnce();
});
