"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConsoleStore } from "@/stores/console-store";
import {
  composeDictation,
  dictationAnchor,
  joinTranscript,
  type DictationAnchor,
} from "./dictation-text";
import { getVoiceStreamUrl } from "./voice-url";
import {
  VoiceSession,
  type VoiceHints,
  type VoicePhase,
  type VoiceSessionOptions,
} from "./voice-session";

export type DictationStatus = "idle" | VoicePhase;

/**
 * Microphone loudness, updated many times per second. Read it with
 * useSyncExternalStore so only the meter re-renders, not the composer.
 */
export type VoiceLevel = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
};

function createVoiceLevel() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => value,
    set(next: number) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
  };
}

type Options = {
  draftKey: string;
  getHints?: () => VoiceHints;
  /** Recording stops on its own shortly before the server limit. */
  maxDurationSeconds?: number;
  /** Called when a dictation ends, after the final text is in the draft. */
  onEnd?: () => void;
  /** Test seam for the socket and microphone. */
  sessionOptions?: Pick<
    VoiceSessionOptions,
    "createSocket" | "startMicrophone"
  >;
};

/**
 * Streams dictation into the composer draft. Spoken text replaces the
 * selection that existed when recording started and is rewritten in place as
 * the provider revises it.
 */
export function useVoiceDictation({
  draftKey,
  getHints,
  maxDurationSeconds,
  onEnd,
  sessionOptions,
}: Options) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState<string>();
  const [startedAt, setStartedAt] = useState<number>();
  const [level] = useState(createVoiceLevel);
  const sessionRef = useRef<VoiceSession | undefined>(undefined);
  const anchorRef = useRef<DictationAnchor | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  const write = useCallback(
    (spoken: string) => {
      const anchor = anchorRef.current;
      if (!anchor) return undefined;
      const { text, caret } = composeDictation(anchor, spoken);
      useConsoleStore.getState().setComposerDraft(draftKey, text);
      return caret;
    },
    [draftKey],
  );

  const start = useCallback(
    (textarea?: HTMLTextAreaElement | null) => {
      if (sessionRef.current) return;
      const draft = useConsoleStore.getState().composerDrafts[draftKey] ?? "";
      anchorRef.current = dictationAnchor(
        draft,
        textarea?.selectionStart,
        textarea?.selectionEnd,
      );
      textareaRef.current = textarea ?? null;
      setError(undefined);
      level.set(0);
      const session = new VoiceSession({
        ...sessionOptions,
        url: getVoiceStreamUrl(),
        hints: getHints?.(),
        onPhase: (phase) => {
          setStatus(phase);
          if (phase === "recording") setStartedAt(Date.now());
        },
        onTranscript: (final, partial) => {
          write(joinTranscript(final, partial));
        },
        onLevel: level.set,
        onEnd: ({ text, error: failure }) => {
          if (sessionRef.current === session) sessionRef.current = undefined;
          const caret = text === undefined ? undefined : write(text);
          if (failure) setError(failure.message);
          setStatus("idle");
          setStartedAt(undefined);
          level.set(0);
          // Never focus the field: on phones that opens the keyboard. Only
          // move the caret when the user is already in it.
          const field = textareaRef.current;
          if (
            caret !== undefined &&
            field &&
            document.activeElement === field
          ) {
            requestAnimationFrame(() => field.setSelectionRange(caret, caret));
          }
          onEndRef.current?.();
        },
      });
      sessionRef.current = session;
      void session.start();
    },
    [draftKey, getHints, level, sessionOptions, write],
  );

  const stop = useCallback(() => sessionRef.current?.stop(), []);
  const cancel = useCallback(() => sessionRef.current?.cancel(), []);

  useEffect(() => {
    if (status !== "recording" || !maxDurationSeconds) return;
    const timer = setTimeout(
      () => sessionRef.current?.stop(),
      Math.max(1, maxDurationSeconds - 1) * 1000,
    );
    return () => clearTimeout(timer);
  }, [maxDurationSeconds, status]);

  // Switching sessions or unmounting abandons dictation for the old draft.
  useEffect(
    () => () => {
      sessionRef.current?.cancel();
      sessionRef.current = undefined;
    },
    [draftKey],
  );

  return {
    status,
    error,
    level: level as VoiceLevel,
    startedAt,
    start,
    stop,
    cancel,
    dismissError: useCallback(() => setError(undefined), []),
  };
}
