/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextUsageGauge } from "./context-usage-gauge";

afterEach(cleanup);

describe("ContextUsageGauge", () => {
  it.each([0.1, 0.25, 0.5, 0.75, 1])(
    "aligns arc, needle and color at %s capacity",
    (ratio) => {
      render(<ContextUsageGauge usedTokens={ratio * 100} windowTokens={100} />);
      const needle = screen.getByTestId("usage-needle");
      const arc = screen.getByTestId("usage-arc");
      expect(needle).toHaveAttribute(
        "transform",
        `rotate(${-90 + ratio * 180} 12 18)`,
      );
      expect(arc).toHaveAttribute("stroke-dasharray", `${ratio} 1`);
      expect(needle).toHaveAttribute(
        "stroke",
        `hsl(${120 * (1 - ratio)} 75% 55%)`,
      );
      expect(arc.getAttribute("stroke")).toBe(needle.getAttribute("stroke"));
    },
  );

  it("updates in place and clamps above capacity", () => {
    const { rerender } = render(
      <ContextUsageGauge usedTokens={0} windowTokens={100} />,
    );
    expect(screen.queryByTestId("usage-arc")).not.toBeInTheDocument();
    expect(screen.getByTestId("usage-needle")).toHaveAttribute(
      "transform",
      "rotate(-90 12 18)",
    );
    rerender(<ContextUsageGauge usedTokens={200} windowTokens={100} />);
    expect(screen.getByTestId("usage-needle")).toHaveAttribute(
      "transform",
      "rotate(90 12 18)",
    );
    expect(screen.getByTestId("usage-arc")).toHaveAttribute(
      "stroke-dasharray",
      "1 1",
    );
  });

  it.each([undefined, 0, -1, NaN, Infinity])(
    "keeps missing/invalid capacity neutral (%s)",
    (capacity) => {
      const { container } = render(
        <ContextUsageGauge usedTokens={20} windowTokens={capacity} />,
      );
      expect(container.querySelector("svg")).toHaveAttribute(
        "data-context-percent",
        "unknown",
      );
      expect(screen.queryByTestId("usage-needle")).not.toBeInTheDocument();
      expect(screen.queryByTestId("usage-arc")).not.toBeInTheDocument();
    },
  );
});
