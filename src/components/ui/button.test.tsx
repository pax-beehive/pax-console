/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders an asChild link with an icon as one slottable element", () => {
    render(
      <Button
        asChild
        icon={<svg aria-hidden="true" data-testid="download-icon" />}
        variant="ghost"
      >
        <a href="/download">Download</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "/download");
    expect(link).toHaveClass("inline-flex");
    expect(within(link).getByTestId("download-icon")).toBeInTheDocument();
  });
});
