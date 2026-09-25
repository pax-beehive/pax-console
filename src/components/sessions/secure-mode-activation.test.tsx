/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SecureModeActivation } from "./secure-mode-activation";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("briefly announces encryption activation and removes the floating notice", () => {
  vi.useFakeTimers();
  const { rerender, unmount } = render(<SecureModeActivation />);
  expect(screen.getByRole("status")).toHaveTextContent(/encryption enabled/i);
  act(() => vi.advanceTimersByTime(1500));
  rerender(<SecureModeActivation />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  unmount();
  render(<SecureModeActivation />);
  expect(screen.getByRole("status")).toBeVisible();
});
it("does not announce activation when only the decorative sweep is requested", () => {
  render(<SecureModeActivation showStatus={false} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
