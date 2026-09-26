/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { SessionRowSwipe } from "./session-row-swipe";

beforeAll(() => {
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
        this.isPrimary = init.isPrimary ?? true;
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const archive = vi.fn();
  const select = vi.fn();
  function Fixture() {
    const [open, setOpen] = useState(false);
    return (
      <SessionRowSwipe
        open={open}
        onOpenChange={setOpen}
        action={<button onClick={archive}>Archive</button>}
      >
        <a
          href="/session"
          onClick={(event) => {
            event.preventDefault();
            select();
          }}
        >
          Session
        </a>
      </SessionRowSwipe>
    );
  }
  render(<Fixture />);
  return {
    archive,
    select,
    row: screen.getByRole("link", { name: "Session" }),
  };
}
function swipe(row: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(row, { clientX: 200, clientY: 100 });
  fireEvent.pointerMove(row, { clientX: 200 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(row, { clientX: 200 + dx, clientY: 100 + dy });
}

it("reveals Archive after swiping and only archives on a separate button click", () => {
  const { row, archive, select } = setup();
  swipe(row, -80);
  fireEvent.click(row, { detail: 1 });
  expect(select).not.toHaveBeenCalled();
  expect(archive).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  expect(archive).toHaveBeenCalledOnce();
});
it("does not reveal actions for a short swipe or vertical scroll", () => {
  const { row, archive } = setup();
  swipe(row, -15);
  expect(
    screen.queryByRole("button", { name: "Archive" }),
  ).not.toBeInTheDocument();
  swipe(row, -60, 130);
  expect(
    screen.queryByRole("button", { name: "Archive" }),
  ).not.toBeInTheDocument();
  expect(archive).not.toHaveBeenCalled();
});
it("supports long press without navigating or archiving", () => {
  vi.useFakeTimers();
  const { row, archive, select } = setup();
  fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
  act(() => vi.advanceTimersByTime(500));
  fireEvent.pointerUp(row, { clientX: 100, clientY: 100 });
  fireEvent.click(row, { detail: 1 });
  expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
  expect(archive).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
it("cancels long press when scrolling or when the pointer is cancelled", () => {
  vi.useFakeTimers();
  const { row } = setup();
  fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(row, { clientX: 100, clientY: 125 });
  act(() => vi.advanceTimersByTime(600));
  expect(
    screen.queryByRole("button", { name: "Archive" }),
  ).not.toBeInTheDocument();
  fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
  fireEvent.pointerCancel(row);
  act(() => vi.advanceTimersByTime(600));
  expect(
    screen.queryByRole("button", { name: "Archive" }),
  ).not.toBeInTheDocument();
});
it.each(["right swipe", "outside", "escape", "row tap"])(
  "closes revealed actions with %s",
  (method) => {
    const { row, archive, select } = setup();
    swipe(row, -80);
    fireEvent.click(row, { detail: 1 }); // consume the gesture's synthetic click
    if (method === "right swipe") swipe(row, 80);
    else if (method === "outside") fireEvent.pointerDown(document.body);
    else if (method === "escape")
      fireEvent.keyDown(document, { key: "Escape" });
    else {
      fireEvent.pointerDown(row);
      fireEvent.pointerUp(row);
      fireEvent.click(row, { detail: 1 });
    }
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  },
);
it("preserves normal taps and desktop link behavior", () => {
  const { row, select } = setup();
  fireEvent.pointerDown(row);
  fireEvent.pointerUp(row);
  fireEvent.click(row, { detail: 1 });
  expect(select).toHaveBeenCalledOnce();
  fireEvent.pointerDown(row, { pointerType: "mouse", clientX: 200 });
  fireEvent.pointerMove(row, { pointerType: "mouse", clientX: 80 });
  fireEvent.pointerUp(row, { pointerType: "mouse", clientX: 80 });
  expect(
    screen.queryByRole("button", { name: "Archive" }),
  ).not.toBeInTheDocument();
});

it("does not swallow a new mouse click after a swipe that emitted no click", () => {
  const { row, select } = setup();
  swipe(row, -80);
  swipe(row, 80);
  fireEvent.pointerDown(row, { pointerType: "mouse" });
  fireEvent.pointerUp(row, { pointerType: "mouse" });
  fireEvent.click(row, { detail: 1 });
  expect(select).toHaveBeenCalledOnce();
});
