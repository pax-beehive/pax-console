"use client";

import {
  AlertCircle,
  Info,
  LoaderCircle,
  Mic,
  MicOff,
  Square,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type {
  DictationStatus,
  VoiceLevel,
} from "@/features/voice/use-voice-dictation";

type Props = {
  status: DictationStatus;
  startedAt?: number;
  level: VoiceLevel;
  /** Shown instead of starting when dictation is not possible here. */
  disabledReason?: string;
  onStart: (trigger: HTMLButtonElement) => void;
  onStop: () => void;
};

export function ComposerVoiceControl({
  status,
  startedAt,
  level,
  disabledReason,
  onStart,
  onStop,
}: Props) {
  if (status === "idle") {
    const label = disabledReason ?? "Dictate";
    return (
      <Button
        aria-label={label}
        disabled={Boolean(disabledReason)}
        icon={
          disabledReason ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )
        }
        onClick={(event) => onStart(event.currentTarget)}
        size="icon"
        tooltip={label}
        type="button"
        variant="ghost"
      />
    );
  }
  if (status === "finishing") {
    return (
      <span
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface-3 px-3 text-xs text-ink-muted"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Finishing…
      </span>
    );
  }
  return (
    <span
      aria-label={status === "connecting" ? "Starting dictation" : "Recording"}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-danger/35 bg-danger/10 pl-3 pr-1"
      role="status"
    >
      {status === "connecting" ? (
        <LoaderCircle
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin text-danger motion-reduce:animate-none"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-danger shadow-[0_0_0_4px_rgba(248,113,113,0.18)] motion-reduce:animate-none"
        />
      )}
      <ElapsedTime startedAt={startedAt} />
      <LevelBars level={level} />
      <Button
        aria-label="Stop dictation"
        className="h-7 w-7 rounded-full border-danger bg-danger text-canvas hover:bg-danger hover:text-canvas"
        icon={<Square className="h-3 w-3 fill-current" />}
        onClick={onStop}
        size="icon"
        tooltip="Stop dictation (Esc)"
        type="button"
        variant="ghost"
      />
    </span>
  );
}

function ElapsedTime({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(startedAt ?? 0);
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const seconds =
    startedAt === undefined
      ? 0
      : Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span className="text-xs tabular-nums text-ink-muted">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

const BAR_WEIGHTS = [0.45, 0.8, 1, 0.7, 0.4];

function LevelBars({ level }: { level: VoiceLevel }) {
  const value = useSyncExternalStore(
    level.subscribe,
    level.getSnapshot,
    () => 0,
  );
  return (
    <span
      aria-hidden="true"
      className="hidden h-4 items-center gap-0.5 sm:inline-flex"
    >
      {BAR_WEIGHTS.map((weight, index) => (
        <span
          className="block w-[3px] rounded-sm bg-danger/85"
          key={index}
          style={{
            height: `${4 + Math.round(12 * Math.min(1, value * weight * 1.6))}px`,
          }}
        />
      ))}
    </span>
  );
}

export function ComposerVoiceError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mb-2 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2"
      role="alert"
    >
      <AlertCircle
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-danger"
      />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-ink">Voice input stopped</p>
        <p className="mt-0.5 text-ink-muted">{message}</p>
      </div>
      <Button
        aria-label="Dismiss voice input error"
        className="h-6 w-6"
        icon={<X className="h-3.5 w-3.5" />}
        onClick={onDismiss}
        size="icon"
        type="button"
        variant="ghost"
      />
    </div>
  );
}

export function ComposerVoiceNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mb-2 flex items-start gap-2 rounded-xl border border-hairline bg-surface-2 px-3 py-2"
      role="status"
    >
      <Info
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
      />
      <p className="min-w-0 flex-1 text-xs text-ink-muted">{message}</p>
      <Button
        aria-label="Dismiss voice input notice"
        className="h-6 w-6"
        icon={<X className="h-3.5 w-3.5" />}
        onClick={onDismiss}
        size="icon"
        type="button"
        variant="ghost"
      />
    </div>
  );
}
