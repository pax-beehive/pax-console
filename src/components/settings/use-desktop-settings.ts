"use client";

import { useSyncExternalStore } from "react";

// Match the shell's lg breakpoint. The mobile directory is the server fallback;
// desktop-only notification controls mount after the viewport is known.
const query = "(min-width: 1024px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const getSnapshot = () => window.matchMedia?.(query).matches ?? false;
const getServerSnapshot = () => false;

export function useDesktopSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
