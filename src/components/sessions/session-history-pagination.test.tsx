/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionHistoryPagination } from "./session-history-pagination";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderHistory(
  options: {
    hasMore?: boolean;
    isLoading?: boolean;
    hasError?: boolean;
    height?: number;
  } = {},
) {
  const load = vi.fn();
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
    options.height ?? 300,
  );
  function History() {
    const scrollRef = useRef<HTMLDivElement>(null);
    return (
      <div ref={scrollRef}>
        <SessionHistoryPagination
          scrollRef={scrollRef}
          hasMore={options.hasMore ?? true}
          isLoading={options.isLoading ?? false}
          hasError={options.hasError ?? false}
          onLoadEarlier={load}
        />
        <p>Latest encrypted turn</p>
      </div>
    );
  }
  render(<History />);
  return load;
}

describe("earlier session history access", () => {
  it("loads older messages without a scroll event when the latest turn does not fill the viewport", () => {
    const load = renderHistory();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("offers an explicit load action when older messages exist", () => {
    const load = renderHistory({ height: 1200 });
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier messages" }),
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not loop after a failure and lets the user retry", () => {
    const load = renderHistory({ hasError: true });
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry earlier messages" }),
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not fetch again while a page is loading", () => {
    const load = renderHistory({ isLoading: true });
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading earlier messages",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stops when there is no older history", () => {
    const load = renderHistory({ hasMore: false });
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("rechecks after a viewport resize without duplicating the pending request", () => {
    let resize!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const load = renderHistory({ height: 1200 });
    expect(load).not.toHaveBeenCalled();
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
      1400,
    );
    resize();
    resize();
    expect(load).toHaveBeenCalledTimes(1);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
