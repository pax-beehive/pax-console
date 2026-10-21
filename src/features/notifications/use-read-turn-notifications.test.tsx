/* @vitest-environment jsdom */
import { webcrypto } from "node:crypto";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadTurnNotifications } from "./use-read-turn-notifications";
import { turnNotificationId } from "./read-turns";

let focused = true;
let hidden = false;
let callback: IntersectionObserverCallback;
let observer: IntersectionObserver;
const postMessage = vi.fn();
const observe = vi.fn();
const disconnect = vi.fn();
const getRegistration = vi.fn();
function View({
  sessionId = "session",
  targets = new Map([["reply", "turn"]]),
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useReadTurnNotifications({
    userId: "user",
    agentId: "agent",
    sessionId,
    targets,
    scrollRef,
  });
  return (
    <div ref={scrollRef}>
      <span data-notification-read-turn={targets.get("reply")} />
    </div>
  );
}
const intersect = (isIntersecting = true) =>
  callback(
    [
      {
        target: document.querySelector("[data-notification-read-turn]")!,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
      } as IntersectionObserverEntry,
    ],
    observer,
  );
beforeEach(() => {
  focused = true;
  hidden = false;
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    hidden ? "hidden" : "visible",
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
        observer = this as unknown as IntersectionObserver;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("TextEncoder", globalThis.TextEncoder);
  getRegistration.mockResolvedValue({
    active: { scriptURL: "http://localhost:3000/push-sw.js", postMessage },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("visible completed reply notification cleanup", () => {
  it("waits for the reply end to enter the viewport and sends only its opaque turn identity", async () => {
    render(<View />);
    expect(observe).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
    act(() => intersect(false));
    expect(postMessage).not.toHaveBeenCalled();
    act(() => intersect());
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({
        type: "pax:read-turn-notifications",
        ids: [expect.stringMatching(/^ntf_[a-f0-9]{64}$/)],
      }),
    );
    expect(postMessage.mock.calls[0][0].ids).toEqual([
      await turnNotificationId("user", "agent", "session", "turn"),
    ]);
  });

  it("defers hidden or unfocused pages until returning to the visible session", async () => {
    focused = false;
    render(<View />);
    expect(observe).not.toHaveBeenCalled();
    hidden = true;
    focused = true;
    act(() => window.dispatchEvent(new Event("focus")));
    expect(observe).not.toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => intersect());
    await waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  });

  it("waits for synced targets and cancels stale observers when switching sessions", async () => {
    const view = render(<View targets={new Map()} />);
    expect(observe).not.toHaveBeenCalled();
    view.rerender(<View />);
    const stale = callback;
    view.rerender(<View sessionId="other" targets={new Map()} />);
    act(() =>
      stale(
        [
          {
            target: document.createElement("span"),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        observer,
      ),
    );
    expect(postMessage).not.toHaveBeenCalled();
    view.rerender(<View sessionId="other" />);
    act(() => intersect());
    await waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
    expect(postMessage.mock.calls[0][0].ids).toEqual([
      await turnNotificationId("user", "agent", "other", "turn"),
    ]);
    expect(disconnect).toHaveBeenCalled();
  });

  it("uses only an existing push worker, retries on refocus, and never requests permission", async () => {
    getRegistration.mockRejectedValueOnce(new Error("unavailable"));
    render(<View />);
    act(() => intersect());
    await waitFor(() => expect(getRegistration).toHaveBeenCalledOnce());
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => intersect());
    await waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
    expect(getRegistration).toHaveBeenCalledWith("/");
  });
});
