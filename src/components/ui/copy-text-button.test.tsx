/* @vitest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyTextButton } from "./copy-text-button";
import { TooltipProvider } from "./tooltip";

describe("CopyTextButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies the text and confirms with the copied label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <TooltipProvider>
        <CopyTextButton
          copiedLabel="Copied"
          label="Copy email address"
          text="team@example.com"
        />
      </TooltipProvider>,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy email address" }),
      );
    });

    expect(writeText).toHaveBeenCalledWith("team@example.com");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
