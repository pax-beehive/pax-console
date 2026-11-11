"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  MediaController,
  MediaControlBar,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import { AudioLines, ChevronUp, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./artifact-media-preview.module.css";

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

export type ArtifactMediaPlaybackState = {
  src: string;
  sourceId?: string;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  paused: boolean;
};

export function ArtifactMediaPreview({
  active = true,
  expiresAt,
  kind,
  onRefreshSource,
  playbackRef,
  src,
  sourceId,
  title,
}: {
  active?: boolean;
  expiresAt?: string;
  kind: "video" | "audio";
  onRefreshSource?: () => Promise<void>;
  playbackRef?: RefObject<ArtifactMediaPlaybackState | undefined>;
  src: string;
  sourceId?: string;
  title: string;
}) {
  const sourceVersion = JSON.stringify([src, sourceId, expiresAt]);
  const [failedVersion, setFailedVersion] = useState<string>();
  const [renewalErrorVersion, setRenewalErrorVersion] = useState<string>();
  const [renewingVersion, setRenewingVersion] = useState<string>();
  const [playbackRate, setPlaybackRate] = useState(1);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [rateControlFocused, setRateControlFocused] = useState(false);
  const [menuContainer, setMenuContainer] = useState<Element>();
  const mediaRef = useRef<HTMLMediaElement>(null);
  const activeRef = useRef(active);
  const restoredRef = useRef(false);
  const playingIntentRef = useRef(false);
  const resumeAfterRenewalRef = useRef(false);
  const mountedRef = useRef(true);
  const failedRef = useRef<string>(undefined);
  const renewalRef = useRef({ version: "", attempted: false, pending: false });
  const renewalTimeRef = useRef<{ version: string; at: number }>(undefined);

  useEffect(() => {
    const handleFullscreenChange = () =>
      setMenuContainer(document.fullscreenElement ?? undefined);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    activeRef.current = active;
    if (!active) {
      playingIntentRef.current = false;
      resumeAfterRenewalRef.current = false;
      const saved = playbackRef?.current;
      const sameSource =
        sourceId !== undefined
          ? saved?.sourceId === sourceId
          : saved?.src === src;
      if (saved && sameSource && playbackRef) {
        playbackRef.current = { ...saved, paused: true };
      }
    }
  }, [active, playbackRef, sourceId, src]);

  const renewSource = useCallback(
    (manual = false) => {
      if (
        !active ||
        !onRefreshSource ||
        !mountedRef.current ||
        (!manual && failedRef.current === sourceVersion)
      ) {
        return false;
      }
      if (renewalRef.current.version !== sourceVersion) {
        renewalRef.current = {
          version: sourceVersion,
          attempted: false,
          pending: false,
        };
      }
      const request = renewalRef.current;
      if (request.pending) return true;
      if (request.attempted && !manual) return false;
      request.attempted = true;
      request.pending = true;
      setRenewingVersion(sourceVersion);
      void (async () => {
        try {
          await onRefreshSource();
          if (mountedRef.current && renewalRef.current === request)
            setRenewalErrorVersion(undefined);
        } catch {
          if (mountedRef.current && renewalRef.current === request)
            setRenewalErrorVersion(sourceVersion);
        } finally {
          request.pending = false;
          if (mountedRef.current && renewalRef.current === request)
            setRenewingVersion(undefined);
        }
      })();
      return true;
    },
    [active, onRefreshSource, sourceVersion],
  );

  useEffect(() => {
    if (renewalTimeRef.current?.version !== sourceVersion) {
      const expiration = expiresAt ? Date.parse(expiresAt) : NaN;
      if (!Number.isFinite(expiration)) {
        renewalTimeRef.current = undefined;
        return;
      }
      const remaining = Math.max(0, expiration - Date.now());
      renewalTimeRef.current = {
        version: sourceVersion,
        at: expiration - Math.min(30_000, remaining / 2),
      };
    }
    if (!active || !onRefreshSource) return;
    const timer = window.setTimeout(
      () => renewSource(),
      Math.max(0, renewalTimeRef.current.at - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [active, expiresAt, onRefreshSource, renewSource, sourceVersion]);

  const sourceNeedsRenewal = () => {
    const renewal = renewalTimeRef.current;
    return renewal?.version === sourceVersion && Date.now() >= renewal.at;
  };
  const handleSourceActivity = () => {
    if (sourceNeedsRenewal()) renewSource();
  };
  const handlePlayback = () => {
    playingIntentRef.current = true;
    handleSourceActivity();
  };
  const handlePause = () => {
    if (!mediaRef.current?.error) {
      playingIntentRef.current = false;
      resumeAfterRenewalRef.current = false;
    }
  };
  const handleError = () => {
    // Expired HTTP responses may surface as NETWORK or SRC_NOT_SUPPORTED.
    // MediaError exposes no HTTP status, so only retry them around known expiry.
    const code = mediaRef.current?.error?.code;
    if ((code === 2 || code === 4) && onRefreshSource && sourceNeedsRenewal()) {
      // An expiry failure can pause the element after the user's Play request.
      resumeAfterRenewalRef.current = playingIntentRef.current;
      if (active && !renewSource()) setRenewalErrorVersion(sourceVersion);
      return;
    }
    resumeAfterRenewalRef.current = false;
    failedRef.current = sourceVersion;
    setFailedVersion(sourceVersion);
  };

  const restorePlayback = useCallback(() => {
    const media = mediaRef.current;
    const saved = playbackRef?.current;
    const sameSource =
      sourceId !== undefined
        ? saved?.sourceId === sourceId
        : saved?.src === src;
    if (!media || !saved || !sameSource || restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    media.currentTime = saved.currentTime;
    media.volume = saved.volume;
    media.muted = saved.muted;
    media.playbackRate = saved.playbackRate;
    if (!saved.paused && activeRef.current) {
      playingIntentRef.current = true;
      try {
        void media.play()?.catch(() => {
          // Browser playback policies may require using the Play control.
        });
      } catch {
        // Keep playback controls available if resuming playback is unsupported.
      }
    }
  }, [playbackRef, sourceId, src]);

  useLayoutEffect(() => {
    const media = mediaRef.current;
    restoredRef.current = false;
    if (media && media.readyState >= media.HAVE_METADATA) {
      restorePlayback();
    }
    return () => {
      if (media && playbackRef) {
        const previous = playbackRef.current;
        const sameSource =
          sourceId !== undefined
            ? previous?.sourceId === sourceId
            : previous?.src === src;
        if (
          previous &&
          sameSource &&
          media.readyState < media.HAVE_METADATA &&
          !restoredRef.current &&
          media.currentTime === 0
        ) {
          // A replacement may unmount before metadata; retain its pending seek.
          playbackRef.current = {
            ...previous,
            src,
            paused: activeRef.current ? previous.paused : true,
          };
          return;
        }
        playbackRef.current = {
          src,
          ...(sourceId !== undefined ? { sourceId } : {}),
          currentTime: media.currentTime,
          volume: media.volume,
          muted: media.muted,
          playbackRate: media.playbackRate,
          paused:
            !activeRef.current ||
            (resumeAfterRenewalRef.current ? false : media.paused),
        };
      }
    };
  }, [playbackRef, restorePlayback, sourceId, src]);

  const label = `${kind === "video" ? "Video" : "Audio"} player: ${title}`;
  const props = {
    "aria-label": label,
    slot: "media",
    preload: "metadata",
    src,
    onError: handleError,
    onPlay: handlePlayback,
    onPlaying: handlePlayback,
    onPause: handlePause,
    onSeeking: handleSourceActivity,
    onLoadedMetadata: restorePlayback,
    onRateChange: () => setPlaybackRate(mediaRef.current?.playbackRate ?? 1),
  };

  return (
    <div className={styles.preview}>
      <MediaController
        audio={kind === "audio"}
        noHotkeys={rateMenuOpen || rateControlFocused}
        autohide={
          kind === "audio" || rateMenuOpen || rateControlFocused ? "-1" : "3"
        }
        className={`${styles.player} ${kind === "audio" ? styles.audio : ""}`}
        aria-label={`${kind === "video" ? "Video" : "Audio"} playback controls`}
      >
        {kind === "video" ? (
          <video
            {...props}
            ref={mediaRef as RefObject<HTMLVideoElement | null>}
            playsInline
            className={styles.video}
          >
            Your browser does not support video playback.
          </video>
        ) : (
          <audio
            {...props}
            ref={mediaRef as RefObject<HTMLAudioElement | null>}
          >
            Your browser does not support audio playback.
          </audio>
        )}
        {kind === "audio" && (
          <div className={styles.audioHeader}>
            <div className={styles.audioIcon}>
              <AudioLines aria-hidden="true" size={22} />
            </div>
            <div className={styles.audioInfo}>
              <div className={styles.audioTitle} title={title}>
                {title}
              </div>
              <div className={styles.audioSubtitle}>Audio</div>
            </div>
          </div>
        )}
        <div className={styles.chrome}>
          <MediaTimeRange className={styles.timeline} aria-label="Seek" />
          <MediaControlBar className={styles.controls}>
            <MediaPlayButton className={styles.playButton}>
              <Play
                slot="play"
                aria-hidden="true"
                fill="currentColor"
                strokeWidth={0}
              />
              <Pause
                slot="pause"
                aria-hidden="true"
                fill="currentColor"
                strokeWidth={0}
              />
            </MediaPlayButton>
            <MediaMuteButton />
            <MediaVolumeRange className={styles.volume} />
            <MediaTimeDisplay showDuration className={styles.time} />
            <span className={styles.spacer} />
            <DropdownMenu
              modal={false}
              open={active && rateMenuOpen}
              onOpenChange={setRateMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.rateButton}
                  aria-label={`Playback speed: ${playbackRate}×`}
                  onFocus={() => setRateControlFocused(true)}
                  onBlur={() => setRateControlFocused(false)}
                >
                  <span className={styles.rateLabel}>
                    {playbackRate}×
                    <ChevronUp size={12} aria-hidden="true" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                container={menuContainer}
                side="top"
                align="end"
                avoidCollisions={false}
                className={styles.rateMenu}
                aria-label="Playback speed"
              >
                <DropdownMenuRadioGroup
                  value={String(playbackRate)}
                  onValueChange={(value) => {
                    const media = mediaRef.current;
                    if (!media) return;
                    media.playbackRate = Number(value);
                    setPlaybackRate(media.playbackRate);
                  }}
                >
                  {playbackRates.map((rate) => (
                    <DropdownMenuRadioItem key={rate} value={String(rate)}>
                      {rate}×
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {kind === "video" && <MediaFullscreenButton />}
          </MediaControlBar>
        </div>
      </MediaController>
      {renewalErrorVersion === sourceVersion ? (
        <div
          role="alert"
          className={styles.error}
          aria-busy={renewingVersion === sourceVersion}
        >
          <p>
            Unable to renew this playback link. Retry or use Download to play
            the file locally.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={renewingVersion === sourceVersion}
            onClick={() => renewSource(true)}
          >
            Retry playback
          </Button>
        </div>
      ) : (
        failedVersion === sourceVersion && (
          <p role="alert" className={styles.error}>
            Unable to play this media. Your browser may not support its format
            or codec. Download the file to play it locally.
          </p>
        )
      )}
    </div>
  );
}
