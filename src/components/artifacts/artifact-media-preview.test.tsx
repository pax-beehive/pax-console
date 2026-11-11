/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ArtifactMediaPreview,
  type ArtifactMediaPlaybackState,
} from "./artifact-media-preview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("artifact media playback continuity", () => {
  it.each(["video", "audio"] as const)(
    "given a playing %s, resumes its position and settings after remounting the same source",
    (kind) => {
      const playbackRef = {
        current: undefined as ArtifactMediaPlaybackState | undefined,
      };
      const props = { kind, src: "blob:clip", title: "Clip", playbackRef };
      const first = render(<ArtifactMediaPreview {...props} />);
      const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
      player.currentTime = 23;
      player.volume = 0.4;
      player.muted = true;
      player.playbackRate = 1.5;
      Object.defineProperty(player, "paused", { value: false });

      first.unmount();

      expect(playbackRef.current).toEqual({
        src: "blob:clip",
        currentTime: 23,
        volume: 0.4,
        muted: true,
        playbackRate: 1.5,
        paused: false,
      });

      render(<ArtifactMediaPreview {...props} />);
      const replacement = screen.getByLabelText(
        /player: Clip/,
      ) as HTMLMediaElement;
      const play = vi.spyOn(replacement, "play").mockResolvedValue();

      expect(play).not.toHaveBeenCalled();
      fireEvent.loadedMetadata(replacement);

      expect(replacement.currentTime).toBe(23);
      expect(replacement.volume).toBe(0.4);
      expect(replacement.muted).toBe(true);
      expect(replacement.playbackRate).toBe(1.5);
      expect(play).toHaveBeenCalledOnce();
      fireEvent.loadedMetadata(replacement);
      expect(play).toHaveBeenCalledOnce();
    },
  );

  it("given paused media, restores its position without starting playback", () => {
    const playbackRef = {
      current: savedPlayback({ paused: true }),
    };
    render(
      <ArtifactMediaPreview
        kind="audio"
        src="blob:clip"
        title="Clip"
        playbackRef={playbackRef}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    fireEvent.loadedMetadata(player);

    expect(player.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
    expect(player).not.toHaveAttribute("autoplay");
  });

  it.each([undefined, savedPlayback({ src: "blob:previous" })])(
    "given fresh media or a different source, starts with default playback settings",
    (previous) => {
      render(
        <ArtifactMediaPreview
          kind="video"
          src="blob:clip"
          title="Clip"
          playbackRef={{ current: previous }}
        />,
      );
      const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
      const play = vi.spyOn(player, "play").mockResolvedValue();

      fireEvent.loadedMetadata(player);

      expect(player.currentTime).toBe(0);
      expect(player.volume).toBe(1);
      expect(player.muted).toBe(false);
      expect(player.playbackRate).toBe(1);
      expect(play).not.toHaveBeenCalled();
    },
  );

  it("given a browser that blocks resuming playback, keeps playback controls usable", async () => {
    render(
      <ArtifactMediaPreview
        kind="video"
        src="blob:clip"
        title="Clip"
        playbackRef={{ current: savedPlayback() }}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi
      .spyOn(player, "play")
      .mockRejectedValue(
        new DOMException("User activation required", "NotAllowedError"),
      );

    fireEvent.loadedMetadata(player);
    await Promise.resolve();

    expect(play).toHaveBeenCalledOnce();
    expect(player.closest("media-controller")).toBeInTheDocument();
    expect(player.currentTime).toBe(12);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function savedPlayback(
  overrides: Partial<ArtifactMediaPlaybackState> = {},
): ArtifactMediaPlaybackState {
  return {
    src: "blob:clip",
    currentTime: 12,
    volume: 0.6,
    muted: false,
    playbackRate: 1.25,
    paused: false,
    ...overrides,
  };
}
