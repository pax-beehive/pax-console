"use client";

import {
  type RefObject,
  useCallback,
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
  MediaPlaybackRateButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import { AudioLines } from "lucide-react";
import styles from "./artifact-media-preview.module.css";

export type ArtifactMediaPlaybackState = {
  src: string;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  paused: boolean;
};

export function ArtifactMediaPreview({
  kind,
  playbackRef,
  src,
  title,
}: {
  kind: "video" | "audio";
  playbackRef?: RefObject<ArtifactMediaPlaybackState | undefined>;
  src: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const restoredRef = useRef(false);
  const restorePlayback = useCallback(() => {
    const media = mediaRef.current;
    const saved = playbackRef?.current;
    if (!media || !saved || saved.src !== src || restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    media.currentTime = saved.currentTime;
    media.volume = saved.volume;
    media.muted = saved.muted;
    media.playbackRate = saved.playbackRate;
    if (!saved.paused) {
      try {
        void media.play()?.catch(() => {
          // Browser playback policies may require using the Play control.
        });
      } catch {
        // Keep playback controls available if resuming playback is unsupported.
      }
    }
  }, [playbackRef, src]);

  useLayoutEffect(() => {
    const media = mediaRef.current;
    restoredRef.current = false;
    if (media && media.readyState >= media.HAVE_METADATA) {
      restorePlayback();
    }
    return () => {
      if (media && playbackRef) {
        playbackRef.current = {
          src,
          currentTime: media.currentTime,
          volume: media.volume,
          muted: media.muted,
          playbackRate: media.playbackRate,
          paused: media.paused,
        };
      }
    };
  }, [playbackRef, restorePlayback, src]);

  const label = `${kind === "video" ? "Video" : "Audio"} player: ${title}`;
  const props = {
    "aria-label": label,
    slot: "media",
    preload: "metadata",
    src,
    onError: () => setFailed(true),
    onLoadedMetadata: restorePlayback,
  };

  return (
    <div className={styles.preview}>
      <MediaController
        audio={kind === "audio"}
        autohide={kind === "audio" ? "-1" : "3"}
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
            <MediaPlayButton className={styles.playButton} />
            <MediaMuteButton />
            <MediaVolumeRange className={styles.volume} />
            <MediaTimeDisplay showDuration className={styles.time} />
            <span className={styles.spacer} />
            <MediaPlaybackRateButton rates={[0.5, 0.75, 1, 1.25, 1.5, 2]} />
            {kind === "video" && <MediaFullscreenButton />}
          </MediaControlBar>
        </div>
      </MediaController>
      {failed && (
        <p role="alert" className={styles.error}>
          Unable to play this media. Your browser may not support its format or
          codec. Download the file to play it locally.
        </p>
      )}
    </div>
  );
}
