/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeBrowserVNC } from "./node-browser-vnc";

const mocks = vi.hoisted(() => ({
  viewers: [] as Array<EventTarget & { sendKey: ReturnType<typeof vi.fn> }>,
  channels: [] as Array<{
    readyState: number;
    sendText: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("./docker-browser-preview", () => ({
  DockerBrowserPreview: () => null,
}));
vi.mock("@/features/browser-control/vnc-channel", () => ({
  VNCChannel: class {
    readyState = 0;
    failure = null;
    sendText = vi.fn(async () => {});
    constructor() {
      mocks.channels.push(this);
    }
    async connect() {
      this.readyState = 1;
    }
    close() {
      this.readyState = 3;
    }
  },
}));
vi.mock("@novnc/novnc/lib/rfb", () => ({
  default: class extends EventTarget {
    sendKey = vi.fn();
    constructor() {
      super();
      mocks.viewers.push(this);
    }
    disconnect() {
      this.dispatchEvent(new Event("disconnect"));
    }
  },
}));
afterEach(() => {
  cleanup();
  mocks.viewers.length = 0;
  mocks.channels.length = 0;
});

async function connect() {
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider>
      <NodeBrowserVNC userId="u" nodeId="n" />
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() => expect(mocks.viewers).toHaveLength(1));
  const viewer = mocks.viewers[0];
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  act(() => viewer.dispatchEvent(new Event("connect")));
  expect(viewer.sendKey.mock.calls).toHaveLength(10);
  expect(viewer.sendKey.mock.calls.every((call) => call[2] === false)).toBe(
    true,
  );
  expect(viewer.sendKey.mock.calls.some((call) => call[0] === 0xffe5)).toBe(
    false,
  );
  viewer.sendKey.mockClear();
  return {
    user,
    viewer,
    view,
    channel: mocks.channels[0],
    input: screen.getByRole("textbox", { name: "Text for remote desktop" }),
  };
}

it("keeps IME candidates local and pastes committed text exactly once without key conversion", async () => {
  const { viewer, channel, input } = await connect();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "ni" } });
  fireEvent.compositionUpdate(input, { data: "你" });
  expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(channel.sendText).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: "你好" });
  const text = "你好aA!😀\n\t";
  fireEvent.change(input, { target: { value: text } });
  expect(channel.sendText).not.toHaveBeenCalled();
  const send = screen.getByRole("button", { name: "Send text" });
  fireEvent.click(send);
  fireEvent.click(send);
  expect(input).toHaveValue("");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled(),
  );
  expect(channel.sendText).toHaveBeenCalledExactlyOnceWith(text);
  expect(viewer.sendKey).not.toHaveBeenCalled();
});

it("discards drafts on disconnect and when takeover is released", async () => {
  const { viewer, channel, input, user } = await connect();
  fireEvent.change(input, { target: { value: "private draft" } });
  channel.readyState = 3;
  act(() => viewer.dispatchEvent(new Event("disconnect")));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(channel.sendText).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Release control" }));
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() => expect(mocks.viewers).toHaveLength(2));
  act(() => mocks.viewers[1].dispatchEvent(new Event("connect")));
  expect(screen.getByRole("textbox")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Release control" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("clears ambiguous sends and reports failure without retrying or echoing sensitive error details", async () => {
  const { viewer, channel, input } = await connect();
  channel.sendText.mockRejectedValueOnce(
    Error("Remote failure containing sensitive content"),
  );
  fireEvent.change(input, { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(
    await screen.findByText(/Text delivery was interrupted/),
  ).toBeVisible();
  expect(input).toHaveValue("");
  expect(screen.queryByText(/sensitive content/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(channel.sendText).toHaveBeenCalledExactlyOnceWith("abc");
  expect(viewer.sendKey).not.toHaveBeenCalled();
});

it("disables repeated sends and draft editing until the paste is acknowledged", async () => {
  const { channel, input } = await connect();
  let acknowledge!: () => void;
  channel.sendText.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        acknowledge = done;
      }),
  );
  fireEvent.change(input, { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(input).toBeDisabled();
  expect(input).toHaveValue("");
  const pendingSend = screen.getByRole("button", { name: "Sending…" });
  expect(pendingSend).toBeDisabled();
  fireEvent.click(pendingSend);
  expect(channel.sendText).toHaveBeenCalledOnce();
  await act(async () => acknowledge());
  expect(input).toBeEnabled();
  expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
});

it("discards pending text on disconnect and ignores a late paste rejection after unmount", async () => {
  const { viewer, channel, input } = await connect();
  let reject!: (error: Error) => void;
  channel.sendText.mockImplementationOnce(
    () =>
      new Promise<void>((_done, fail) => {
        reject = fail;
      }),
  );
  fireEvent.change(input, { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  channel.readyState = 3;
  act(() => viewer.dispatchEvent(new Event("disconnect")));
  await act(async () => reject(Error("Disconnected")));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(channel.sendText).toHaveBeenCalledOnce();
  expect(viewer.sendKey).not.toHaveBeenCalled();
});

it("surfaces unsupported-node upgrade guidance without falling back to keystrokes", async () => {
  const { viewer, channel, input } = await connect();
  channel.sendText.mockRejectedValueOnce(
    Error("Unsupported Docker viewer action"),
  );
  fireEvent.change(input, { target: { value: "你好" } });
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(
    await screen.findByText(/Update paxd and the Docker browser runtime/),
  ).toBeVisible();
  expect(channel.sendText).toHaveBeenCalledOnce();
  expect(viewer.sendKey).not.toHaveBeenCalled();
  expect(input).toHaveValue("");
});

it("retains oversized drafts for editing instead of truncating or sending them", async () => {
  const { channel, input } = await connect();
  const draft = "a".repeat(2001);
  fireEvent.change(input, { target: { value: draft } });
  expect(input).toHaveValue(draft);
  expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
  expect(screen.getByText(/Text exceeds 2,000 characters/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(channel.sendText).not.toHaveBeenCalled();
});
