"use client";

import { useSyncExternalStore } from "react";

/**
 * Which microphone dictation asks for on this device.
 *
 * - "device": the built-in microphone without voice-call processing. Browsers
 *   then leave Bluetooth earbuds in their music profile, so playback keeps
 *   going while you dictate.
 * - "headset": call-style capture with echo cancellation. Bluetooth headsets
 *   switch to their own microphone, which pauses or degrades music.
 */
export type MicrophoneMode = "device" | "headset";

export const DEFAULT_MICROPHONE_MODE: MicrophoneMode = "device";

const storageKey = "pax:voice-microphone-mode";
const listeners = new Set<() => void>();

export function readMicrophoneMode(): MicrophoneMode {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "headset" || stored === "device"
      ? stored
      : DEFAULT_MICROPHONE_MODE;
  } catch {
    return DEFAULT_MICROPHONE_MODE;
  }
}

export function writeMicrophoneMode(mode: MicrophoneMode) {
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // Storage is optional; the choice then lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMicrophoneMode() {
  return useSyncExternalStore(
    subscribe,
    readMicrophoneMode,
    () => DEFAULT_MICROPHONE_MODE,
  );
}

/** getUserMedia audio constraints for a microphone mode. */
export function microphoneConstraints(
  mode: MicrophoneMode,
): MediaTrackConstraints {
  // Any voice-call processing can make Android route audio through the
  // Bluetooth call profile, so the device mode turns all of it off.
  const voiceProcessing = mode === "headset";
  return {
    channelCount: 1,
    echoCancellation: voiceProcessing,
    noiseSuppression: voiceProcessing,
    autoGainControl: voiceProcessing,
  };
}
