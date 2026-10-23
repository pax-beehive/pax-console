/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortCodeApprover } from "./short-code-access";
const mocks = vi.hoisted(() => ({
  match: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/features/e2ee/short-code-runtime", () => ({
  matchShortCode: mocks.match,
  approveShortCode: mocks.approve,
  rejectShortCode: mocks.reject,
}));
vi.mock("@/features/e2ee/short-code-worker-client", () => ({
  ShortCodeCrypto: class {
    close = mocks.close;
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.match.mockResolvedValue({
    request: { device_name: "New laptop" },
    deadline: Date.now() + 30_000,
  });
  mocks.approve.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("matches eight digits automatically but transfers access only after explicit approval", async () => {
  render(
    <TooltipProvider>
      <ShortCodeApprover userId="u" agentId="a" />
    </TooltipProvider>,
  );
  fireEvent.change(screen.getByLabelText("Code from the new device"), {
    target: { value: "12345678" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(mocks.match).toHaveBeenCalledTimes(1);
  expect(mocks.approve).not.toHaveBeenCalled();
  expect(screen.getByText("New laptop")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Authorize device" }));
  });
  expect(mocks.approve).toHaveBeenCalledTimes(1);
});
it("conceals the code by default and lets the user reveal it", () => {
  render(
    <TooltipProvider>
      <ShortCodeApprover userId="u" agentId="a" />
    </TooltipProvider>,
  );
  expect(screen.getByLabelText("Code from the new device")).toHaveAttribute(
    "type",
    "password",
  );
  fireEvent.click(screen.getByRole("button", { name: "Show code" }));
  expect(screen.getByLabelText("Code from the new device")).toHaveAttribute(
    "type",
    "text",
  );
});
it("expires a matched confirmation without silently authorizing", async () => {
  render(
    <TooltipProvider>
      <ShortCodeApprover userId="u" agentId="a" />
    </TooltipProvider>,
  );
  fireEvent.change(screen.getByLabelText("Code from the new device"), {
    target: { value: "12345678" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(
    screen.getByRole("button", { name: "Authorize device" }),
  ).toBeDisabled();
  expect(mocks.approve).not.toHaveBeenCalled();
});
it("aborts pending matching on unmount so agent changes cannot reuse it", async () => {
  let resolve!: (v: unknown) => void;
  mocks.match.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(
    <TooltipProvider>
      <ShortCodeApprover userId="u" agentId="a" />
    </TooltipProvider>,
  );
  fireEvent.change(screen.getByLabelText("Code from the new device"), {
    target: { value: "12345678" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  const signal = mocks.match.mock.calls[0][4] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve({
      request: { device_name: "Old target" },
      deadline: Date.now() + 30_000,
    });
  });
  expect(mocks.approve).not.toHaveBeenCalled();
});
