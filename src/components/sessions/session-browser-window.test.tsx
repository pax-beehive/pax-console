/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBrowserWindow } from "./session-browser-window";
const vnc = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@/features/browser-control/vnc-channel", () => ({
  VNCChannel: class {
    connect = vnc.connect;
    close = vnc.close;
  },
}));
vi.mock("@novnc/novnc/lib/rfb", () => ({
  default: class {
    disconnect = vnc.disconnect;
    addEventListener() {}
  },
}));
vi.mock("@/components/resources/node-browser-control", () => ({
  NodeBrowserViewer: ({ nodeId }: { nodeId: string }) => (
    <div>Watching {nodeId}</div>
  ),
}));
vi.mock("@/components/resources/docker-browser-preview", () => ({
  DockerBrowserPreview: () => <div>Docker preview frame</div>,
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

it("previews Docker by default and only connects while explicitly controlling", async () => {
  vi.clearAllMocks();
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider>
      <SessionBrowserWindow
        nodeId="node-1"
        userId="user"
        onClose={() => view.unmount()}
      />
    </TooltipProvider>,
  );
  expect(vnc.connect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Docker desktop" }));
  expect(screen.getByText("Docker preview frame")).toBeVisible();
  expect(vnc.connect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() => expect(vnc.connect).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Watching node-1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Release control" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Native Chrome" }));
  expect(vnc.close).toHaveBeenCalledTimes(1);
  expect(vnc.disconnect).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Watching node-1")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Docker desktop" }));
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() => expect(vnc.connect).toHaveBeenCalledTimes(2));
  await user.click(
    screen.getByRole("button", { name: "Close browser preview" }),
  );
  expect(vnc.close).toHaveBeenCalledTimes(2);
  expect(vnc.disconnect).toHaveBeenCalledTimes(2);
});

for (const event of ["blur", "pagehide", "visibilitychange"]) {
  it(`returns to preview on ${event} and never retakes control on focus`, async () => {
    vi.clearAllMocks();
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SessionBrowserWindow nodeId="node" userId="user" onClose={() => {}} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Docker desktop" }));
    await user.click(screen.getByRole("button", { name: "Take control" }));
    await waitFor(() => expect(vnc.connect).toHaveBeenCalledOnce());
    const visibility =
      event === "visibilitychange"
        ? vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
        : undefined;
    act(() => {
      (event === "visibilitychange" ? document : window).dispatchEvent(
        new Event(event),
      );
    });
    expect(vnc.close).toHaveBeenCalledOnce();
    expect(screen.getByText("Docker preview frame")).toBeVisible();
    visibility?.mockRestore();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(vnc.connect).toHaveBeenCalledOnce();
  });
}
