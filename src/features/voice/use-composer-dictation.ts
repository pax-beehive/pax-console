"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceDictation } from "./use-voice-dictation";
import type { VoiceHints } from "./voice-session";

type Options = {
  draftKey: string;
  getHints?: () => VoiceHints;
  maxDurationSeconds?: number;
  /** Dictation is not allowed here, e.g. an encrypted composer. */
  blocked?: boolean;
  /** Sends the composer draft once a requested send can proceed. */
  send: () => void;
};

/**
 * Dictation for a composer form. Sending while dictating stops recording and
 * sends once the final transcript is in the draft. A failed dictation keeps
 * its text for review instead of sending a possibly truncated message, and a
 * cancelled one (draft switch or encryption) never sends another draft.
 */
export function useComposerDictation({
  draftKey,
  getHints,
  maxDurationSeconds,
  blocked = false,
  send,
}: Options) {
  const [sendPending, setSendPending] = useState(false);
  // The draft key a pending send was requested for. A ref, because the send
  // happens in the effect after dictation ends, which must not set state.
  const sendForRef = useRef<string | null>(null);
  const voice = useVoiceDictation({
    draftKey,
    getHints,
    maxDurationSeconds,
    onEnd: () => setSendPending(false),
  });
  const dictating = voice.status !== "idle";

  const cancel = voice.cancel;
  useEffect(() => {
    if (blocked) cancel();
  }, [blocked, cancel]);

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  const error = voice.error;
  // Runs once the composer has re-rendered without dictation, so send sees
  // the final draft and an enabled composer.
  useEffect(() => {
    const requestedFor = sendForRef.current;
    if (!requestedFor || dictating) return;
    sendForRef.current = null;
    if (requestedFor === draftKey && !error && !blocked) sendRef.current();
  }, [blocked, dictating, draftKey, error]);

  const stop = voice.stop;
  const sendWhenDone = useCallback(() => {
    if (!dictating || sendForRef.current) return;
    sendForRef.current = draftKey;
    setSendPending(true);
    stop();
  }, [dictating, draftKey, stop]);

  return {
    ...voice,
    dictating,
    /** A send is waiting for the final transcript. */
    sendPending,
    sendWhenDone,
  };
}
