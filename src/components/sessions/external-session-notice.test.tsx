/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useSessionNoticeStore } from "@/stores/session-notice-store";
import { ExternalSessionNotice } from "./external-session-notice";

const label = "Dismiss external session notice";
const props = { userId: "user", agentId: "agent", sessionId: "session" };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSessionNoticeStore.setState({ dismissed: {} });
  localStorage.clear();
});

it("dismisses only this user's notice for the selected agent and session", async () => {
  const user = userEvent.setup();
  const view = render(<ExternalSessionNotice {...props} />);
  await user.click(screen.getByRole("button", { name: label }));
  expect(screen.queryByText(/This session was started outside Pax/)).toBeNull();

  for (const changed of [
    { userId: "other" },
    { agentId: "other" },
    { sessionId: "other" },
  ]) {
    view.rerender(<ExternalSessionNotice {...props} {...changed} />);
    expect(screen.getByRole("button", { name: label })).toBeVisible();
  }
  view.rerender(<ExternalSessionNotice {...props} />);
  expect(screen.queryByRole("button", { name: label })).toBeNull();
});

it("restores the hidden choice from browser storage after rehydration", async () => {
  const user = userEvent.setup();
  const view = render(<ExternalSessionNotice {...props} />);
  await user.click(screen.getByRole("button", { name: label }));
  const saved = localStorage.getItem("pax-console:external-session-notices");
  expect(saved).not.toBeNull();
  view.unmount();
  useSessionNoticeStore.setState({ dismissed: {} });
  localStorage.setItem("pax-console:external-session-notices", saved!);
  await act(() => useSessionNoticeStore.persist.rehydrate());
  render(<ExternalSessionNotice {...props} />);
  expect(screen.queryByRole("button", { name: label })).toBeNull();
});

it("still dismisses when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  render(<ExternalSessionNotice {...props} />);
  await userEvent.setup().click(screen.getByRole("button", { name: label }));
  expect(screen.queryByRole("button", { name: label })).toBeNull();
});
