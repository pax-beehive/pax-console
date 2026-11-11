/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactMediaPreview } from "./artifact-media-preview";

afterEach(cleanup);

function renderPlayer(kind: "audio" | "video") {
  render(
    <TooltipProvider>
      <ArtifactMediaPreview kind={kind} src="blob:clip" title="Clip" />
    </TooltipProvider>,
  );
  return screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
}

describe("artifact playback speed menu", () => {
  it.each(["audio", "video"] as const)(
    "given %s, opens an upward choice list and applies the selected speed",
    async (kind) => {
      const user = userEvent.setup();
      const media = renderPlayer(kind);

      await user.click(
        screen.getByRole("button", { name: "Playback speed: 1×" }),
      );

      const menu = screen.getByRole("menu", { name: /Playback speed/ });
      expect(menu).toHaveAttribute("data-side", "top");
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(6);
      expect(screen.getByRole("menuitemradio", { name: "1×" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await user.click(screen.getByRole("menuitemradio", { name: "1.5×" }));

      expect(media.playbackRate).toBe(1.5);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", {
        name: "Playback speed: 1.5×",
      });
      await user.click(trigger);
      expect(
        screen.getByRole("menuitemradio", { name: "1.5×" }),
      ).toHaveAttribute("aria-checked", "true");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

  it("given a restored media rate, reflects it in the trigger and selected option", async () => {
    const user = userEvent.setup();
    const media = renderPlayer("video");

    media.playbackRate = 1.25;
    fireEvent.rateChange(media);
    await user.click(
      screen.getByRole("button", { name: "Playback speed: 1.25×" }),
    );

    expect(
      screen.getByRole("menuitemradio", { name: "1.25×" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("given keyboard focus, opens and selects a speed without starting playback", async () => {
    const user = userEvent.setup();
    const media = renderPlayer("video");

    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{End}");
    await user.keyboard(" ");

    expect(media.playbackRate).toBe(2);
    expect(media.paused).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("given a collapsed preview, hides its open speed menu", async () => {
    const user = userEvent.setup();
    const props = { kind: "video" as const, src: "blob:clip", title: "Clip" };
    const view = render(
      <TooltipProvider>
        <ArtifactMediaPreview {...props} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Playback speed/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    view.rerender(
      <TooltipProvider>
        <ArtifactMediaPreview {...props} active={false} />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
