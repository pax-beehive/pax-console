/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConsoleViewport } from "./use-console-viewport";

class Viewport extends EventTarget {
  height = 900;
  offsetTop = 0;
  scale = 1;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("console visual viewport", () => {
  function Fixture({ onRender = () => {} }: { onRender?: () => void }) {
    onRender();
    const ref = useRef<HTMLElement>(null);
    useConsoleViewport(ref);
    return (
      <main ref={ref}>
        <div data-viewport-scroll />
      </main>
    );
  }

  it("shrinks for an iPad accessory bar and keyboard without React rerenders", async () => {
    const viewport = new Viewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerWidth", 1366);
    const onRender = vi.fn();
    const { container, unmount } = render(<Fixture onRender={onRender} />);
    const shell = container.querySelector("main")!;
    expect(document.documentElement).toHaveAttribute("data-console-viewport");
    for (const height of [856, 560, 900]) {
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
      await waitFor(() =>
        expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
          `${height}px`,
        ),
      );
    }
    viewport.offsetTop = 44;
    viewport.dispatchEvent(new Event("scroll"));
    await waitFor(() =>
      expect(shell.style.getPropertyValue("--console-viewport-top")).toBe(
        "44px",
      ),
    );
    expect(onRender).toHaveBeenCalledOnce();
    unmount();
    expect(document.documentElement).not.toHaveAttribute(
      "data-console-viewport",
    );
  });

  it("preserves reading position and keeps a bottom-pinned timeline pinned", async () => {
    const viewport = new Viewport();
    vi.stubGlobal("visualViewport", viewport);
    const { container } = render(<Fixture />);
    const shell = container.querySelector("main")!;
    const scroller = container.querySelector<HTMLDivElement>(
      "[data-viewport-scroll]",
    )!;
    Object.defineProperties(scroller, {
      scrollHeight: { value: 2000 },
      clientHeight: {
        get: () =>
          Number.parseFloat(
            shell.style.getPropertyValue("--console-viewport-height"),
          ) - 200,
      },
    });
    scroller.scrollTop = 1300;
    viewport.height = 856;
    viewport.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(scroller.scrollTop).toBe(1344));
    scroller.scrollTop = 200;
    viewport.height = 560;
    viewport.dispatchEvent(new Event("resize"));
    await waitFor(() =>
      expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
        "560px",
      ),
    );
    expect(scroller.scrollTop).toBe(200);
  });

  it("keeps pinch zoom independent of keyboard resizing", async () => {
    const viewport = new Viewport();
    vi.stubGlobal("visualViewport", viewport);
    const { container } = render(<Fixture />);
    const shell = container.querySelector("main")!;
    viewport.scale = 2;
    viewport.height = 450;
    viewport.dispatchEvent(new Event("resize"));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
      "900px",
    );
    viewport.scale = 1;
    viewport.height = 856;
    viewport.dispatchEvent(new Event("resize"));
    await waitFor(() =>
      expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
        "856px",
      ),
    );
  });

  it("falls back to window sizing when VisualViewport is unavailable", async () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 800);
    const { container } = render(<Fixture />);
    const shell = container.querySelector("main")!;
    expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
      "800px",
    );
    vi.stubGlobal("innerHeight", 650);
    window.dispatchEvent(new Event("resize"));
    await waitFor(() =>
      expect(shell.style.getPropertyValue("--console-viewport-height")).toBe(
        "650px",
      ),
    );
  });
});
