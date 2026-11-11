/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ArtifactMediaPreview,
  type ArtifactMediaPlaybackState,
} from "./artifact-media-preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it("given a renewed URL for the same artifact, restores playback using its stable source identity", () => {
    const playbackRef = {
      current: savedPlayback({
        sourceId: "artifact/main",
        src: "https://old.example/clip",
      }),
    };
    const view = render(
      <ArtifactMediaPreview
        kind="video"
        src="https://new.example/clip"
        sourceId="artifact/main"
        title="Clip"
        playbackRef={playbackRef}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    fireEvent.loadedMetadata(player);

    expect(player.currentTime).toBe(12);
    expect(player.volume).toBe(0.6);
    expect(player.playbackRate).toBe(1.25);
    expect(play).toHaveBeenCalledOnce();
    view.unmount();
    expect(playbackRef.current).toMatchObject({
      sourceId: "artifact/main",
      src: "https://new.example/clip",
    });
  });

  it("given a different artifact identity, starts fresh even when its URL matches", () => {
    render(
      <ArtifactMediaPreview
        kind="video"
        src="blob:clip"
        sourceId="new-artifact/main"
        title="Clip"
        playbackRef={{
          current: savedPlayback({ sourceId: "old-artifact/main" }),
        }}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    fireEvent.loadedMetadata(player);

    expect(player.currentTime).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("given a hidden renewed preview, restores its position without resuming playback", () => {
    render(
      <ArtifactMediaPreview
        kind="video"
        src="https://new.example/clip"
        sourceId="artifact/main"
        title="Clip"
        active={false}
        playbackRef={{ current: savedPlayback({ sourceId: "artifact/main" }) }}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    fireEvent.loadedMetadata(player);

    expect(player.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
  });

  it("given a renewal collapsed before metadata, keeps its pending position through another remount", () => {
    const playbackRef = {
      current: savedPlayback({ sourceId: "artifact/main" }),
    };
    const props = {
      kind: "video" as const,
      src: "https://new.example/clip",
      sourceId: "artifact/main",
      title: "Clip",
      playbackRef,
    };
    const first = render(<ArtifactMediaPreview {...props} />);
    first.rerender(<ArtifactMediaPreview {...props} active={false} />);
    first.unmount();

    expect(playbackRef.current.currentTime).toBe(12);
    expect(playbackRef.current.paused).toBe(true);
    render(<ArtifactMediaPreview {...props} />);
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();
    fireEvent.loadedMetadata(player);
    expect(player.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
  });

  it("given a replacement collapsed and expanded before metadata, stays paused in the same element", () => {
    const playbackRef = {
      current: savedPlayback({ sourceId: "artifact/main" }),
    };
    const props = {
      kind: "video" as const,
      src: "https://new.example/clip",
      sourceId: "artifact/main",
      title: "Clip",
      playbackRef,
    };
    const view = render(<ArtifactMediaPreview {...props} />);
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    view.rerender(<ArtifactMediaPreview {...props} active={false} />);
    view.rerender(<ArtifactMediaPreview {...props} active />);
    fireEvent.loadedMetadata(player);

    expect(screen.getByLabelText(/player: Clip/)).toBe(player);
    expect(player.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("signed media source renewal", () => {
  const now = Date.UTC(2026, 10, 10, 12);
  const src = "https://storage.example/clip?signature=secret";
  const defaults = {
    kind: "video" as const,
    src,
    sourceId: "artifact/main",
    title: "Clip",
  };
  const expiry = (seconds: number) =>
    new Date(now + seconds * 1000).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it("given a direct signed URL, passes it to the media element without fetching or starting playback", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={vi.fn()}
      />,
    );
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(player, "play").mockResolvedValue();

    fireEvent.loadedMetadata(player);

    expect(player).toHaveAttribute("src", src);
    expect(player).not.toHaveAttribute("crossorigin");
    expect(player).not.toHaveAttribute("autoplay");
    expect(play).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("given a visible preview, renews once thirty seconds before expiry", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );

    await act(() => vi.advanceTimersByTimeAsync(89_999));
    expect(refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("given a short-lived source, waits for half its remaining lifetime", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(20)}
        onRefreshSource={refresh}
      />,
    );

    fireEvent.play(screen.getByLabelText(/player: Clip/));
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("given a hidden preview, waits until it becomes active to renew an expired source", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <ArtifactMediaPreview
        {...defaults}
        active={false}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );

    await act(() => vi.advanceTimersByTimeAsync(130_000));
    fireEvent.play(screen.getByLabelText(/player: Clip/));
    expect(refresh).not.toHaveBeenCalled();
    view.rerender(
      <ArtifactMediaPreview
        {...defaults}
        active
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each(["play", "playing", "seeking"] as const)(
    "given an expired URL, renews on %s before its scheduled timer runs",
    async (event) => {
      const refresh = vi.fn().mockResolvedValue(undefined);
      render(
        <ArtifactMediaPreview
          {...defaults}
          expiresAt={expiry(120)}
          onRefreshSource={refresh}
        />,
      );
      vi.setSystemTime(now + 121_000);

      await act(async () =>
        fireEvent[event](screen.getByLabelText(/player: Clip/)),
      );

      expect(refresh).toHaveBeenCalledOnce();
    },
  );

  it("given concurrent resume, seek, and expired network-error events, deduplicates renewal", async () => {
    let finish!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );
    vi.setSystemTime(now + 121_000);
    const player = screen.getByLabelText(/player: Clip/);
    Object.defineProperty(player, "error", {
      configurable: true,
      value: { code: 2 },
    });

    fireEvent.play(player);
    fireEvent.seeking(player);
    fireEvent.error(player);
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => finish());
    fireEvent.play(player);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    { code: 2, elapsed: 121_000, renews: true },
    { code: 2, elapsed: 0, renews: false },
    { code: 3, elapsed: 121_000, renews: false },
    { code: 4, elapsed: 121_000, renews: true },
    { code: 4, elapsed: 0, renews: false },
  ])(
    "given media error $code after $elapsed ms, renews only an expiry-related transport error",
    async ({ code, elapsed, renews }) => {
      const refresh = vi.fn().mockResolvedValue(undefined);
      render(
        <ArtifactMediaPreview
          {...defaults}
          expiresAt={expiry(120)}
          onRefreshSource={refresh}
        />,
      );
      vi.setSystemTime(now + elapsed);
      const player = screen.getByLabelText(/player: Clip/);
      Object.defineProperty(player, "error", {
        configurable: true,
        value: { code },
      });

      await act(async () => fireEvent.error(player));

      expect(refresh).toHaveBeenCalledTimes(renews ? 1 : 0);
      if (!renews)
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Unable to play this media",
        );
    },
  );

  it("given a renewal failure, exposes a generic explicit retry and prevents automatic retry loops", async () => {
    let rejectRetry!: (reason: Error) => void;
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error(src))
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectRetry = reject;
          }),
      );
    render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );
    vi.setSystemTime(now + 121_000);
    const player = screen.getByLabelText(/player: Clip/);

    await act(async () => fireEvent.play(player));
    expect(screen.getByRole("alert")).toHaveTextContent(/retry.*download/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent("signature");
    fireEvent.play(player);
    fireEvent.seeking(player);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(refresh).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Retry playback" }));
    expect(
      screen.getByRole("button", { name: "Retry playback" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry playback" }));
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => rejectRetry(new Error(src)));
    expect(
      screen.getByRole("button", { name: "Retry playback" }),
    ).toBeEnabled();
    fireEvent.play(player);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("given a successful replacement source, permits renewing its new expiry", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(refresh).toHaveBeenCalledOnce();

    view.rerender(
      <ArtifactMediaPreview
        {...defaults}
        src="https://storage.example/renewed"
        expiresAt={expiry(240)}
        onRefreshSource={refresh}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it.each([
    { code: 2, explicitPause: false, resumes: true },
    { code: 4, explicitPause: false, resumes: true },
    { code: 2, explicitPause: true, resumes: false },
    { code: 3, explicitPause: false, resumes: false },
  ])(
    "given expired error $code and explicitPause=$explicitPause, preserves playback intent through native error pause",
    async ({ code, explicitPause, resumes }) => {
      let finish!: () => void;
      const refresh = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const playbackRef = {
        current: undefined as ArtifactMediaPlaybackState | undefined,
      };
      const first = render(
        <ArtifactMediaPreview
          {...defaults}
          expiresAt={expiry(120)}
          onRefreshSource={refresh}
          playbackRef={playbackRef}
        />,
      );
      const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
      player.currentTime = 23;
      Object.defineProperty(player, "paused", {
        configurable: true,
        value: false,
      });
      if (explicitPause) {
        fireEvent.play(player);
        Object.defineProperty(player, "paused", {
          configurable: true,
          value: true,
        });
        fireEvent.pause(player);
      }
      vi.setSystemTime(now + 121_000);
      fireEvent[explicitPause ? "seeking" : "play"](player);
      expect(refresh).toHaveBeenCalledOnce();
      Object.defineProperty(player, "error", {
        configurable: true,
        value: { code },
      });
      Object.defineProperty(player, "paused", {
        configurable: true,
        value: true,
      });
      fireEvent.pause(player);
      fireEvent.error(player);

      first.unmount();
      await act(async () => finish());
      render(
        <ArtifactMediaPreview
          {...defaults}
          src="https://storage.example/renewed"
          playbackRef={playbackRef}
        />,
      );
      const renewed = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
      const play = vi.spyOn(renewed, "play").mockResolvedValue();
      fireEvent.loadedMetadata(renewed);

      expect(renewed.currentTime).toBe(23);
      expect(play).toHaveBeenCalledTimes(resumes ? 1 : 0);
    },
  );

  it("given an error-paused renewal collapsed and expanded while pending, keeps its replacement paused", async () => {
    let finish!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const playbackRef = {
      current: undefined as ArtifactMediaPlaybackState | undefined,
    };
    const props = {
      ...defaults,
      expiresAt: expiry(120),
      onRefreshSource: refresh,
      playbackRef,
    };
    const first = render(<ArtifactMediaPreview {...props} />);
    const player = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    player.currentTime = 23;
    vi.setSystemTime(now + 121_000);
    fireEvent.play(player);
    Object.defineProperty(player, "error", {
      configurable: true,
      value: { code: 2 },
    });
    Object.defineProperty(player, "paused", {
      configurable: true,
      value: true,
    });
    fireEvent.pause(player);
    fireEvent.error(player);

    first.rerender(<ArtifactMediaPreview {...props} active={false} />);
    first.rerender(<ArtifactMediaPreview {...props} active />);
    first.unmount();
    await act(async () => finish());
    render(
      <ArtifactMediaPreview
        {...defaults}
        src="https://storage.example/renewed"
        playbackRef={playbackRef}
      />,
    );
    const renewed = screen.getByLabelText(/player: Clip/) as HTMLMediaElement;
    const play = vi.spyOn(renewed, "play").mockResolvedValue();
    fireEvent.loadedMetadata(renewed);

    expect(renewed.currentTime).toBe(23);
    expect(play).not.toHaveBeenCalled();
  });

  it("given an unmounted preview, cancels timers and ignores a late failed renewal", async () => {
    let reject!: (reason: Error) => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const view = render(
      <ArtifactMediaPreview
        {...defaults}
        expiresAt={expiry(120)}
        onRefreshSource={refresh}
      />,
    );
    vi.setSystemTime(now + 121_000);
    fireEvent.play(screen.getByLabelText(/player: Clip/));

    view.unmount();
    await act(async () => reject(new Error(src)));
    await act(() => vi.advanceTimersByTimeAsync(240_000));

    expect(refresh).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
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
