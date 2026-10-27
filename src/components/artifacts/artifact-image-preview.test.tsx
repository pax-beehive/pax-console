/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ArtifactImagePreview,
  type ArtifactImageState,
} from "./artifact-image-preview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Preview() {
  const [state, onChange] = useState<ArtifactImageState>({
    width: 1600,
    height: 1000,
  });
  return (
    <TooltipProvider>
      <ArtifactImagePreview
        state={state}
        onChange={onChange}
        src="blob:test"
        title="Diagram"
        fillHeight={false}
      />
    </TooltipProvider>
  );
}

function wheel(canvas: HTMLElement, options: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  fireEvent(canvas, event);
  return event;
}

describe("artifact image wheel zoom", () => {
  it.each(["metaKey", "ctrlKey"])(
    "zooms from fit with %s, preserves ordinary scrolling, and supports reset",
    (modifier) => {
      render(<Preview />);
      const canvas = screen.getByLabelText("Image canvas");
      const image = screen.getByRole("img");
      vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
        width: 800,
        height: 500,
        left: 0,
        top: 0,
      } as DOMRect);
      expect(wheel(canvas, { deltaY: -100 }).defaultPrevented).toBe(false);
      expect(
        screen.getByRole("button", { name: "Show image at actual size" }),
      ).toHaveTextContent("Fit");
      expect(
        wheel(canvas, { deltaY: -100, [modifier]: true }).defaultPrevented,
      ).toBe(true);
      const zoom = screen.getByRole("button", {
        name: "Show image at actual size",
      });
      expect(zoom).toHaveTextContent("61%");
      wheel(canvas, { deltaY: 100, [modifier]: true });
      expect(zoom).toHaveTextContent("50%");
      for (let i = 0; i < 30; i++)
        wheel(canvas, { deltaY: -100, [modifier]: true });
      expect(zoom).toHaveTextContent("400%");
      for (let i = 0; i < 30; i++)
        wheel(canvas, { deltaY: 100, [modifier]: true });
      expect(zoom).toHaveTextContent("25%");
      fireEvent.click(screen.getByRole("button", { name: "Fit image" }));
      expect(zoom).toHaveTextContent("Fit");
    },
  );

  it("does not intercept modified wheel before image dimensions are available", () => {
    render(
      <TooltipProvider>
        <ArtifactImagePreview
          state={{}}
          onChange={vi.fn()}
          src="blob:test"
          title="Loading"
          fillHeight={false}
        />
      </TooltipProvider>,
    );
    expect(
      wheel(screen.getByLabelText("Image canvas"), {
        deltaY: -100,
        ctrlKey: true,
      }).defaultPrevented,
    ).toBe(false);
  });
});
