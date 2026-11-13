"use client";

import { create } from "zustand";
import { resolveLocale, type Locale } from "./translate";

export const LOCALE_STORAGE_KEY = "pax-console-locale";

type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  // The server and first client render must agree. The provider restores the
  // browser preference after hydration without reading browser globals on SSR.
  locale: "en",
  setLocale: (locale) => {
    set({ locale });
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* Storage may be disabled. Switching still works. */
    }
  },
}));

export function browserPreferredLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
}

export function initializeLocale() {
  if (typeof window === "undefined") return;
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    /* Use the browser preference. */
  }
  useLocaleStore.setState({
    locale: resolveLocale(saved, browserPreferredLanguages()),
  });
}
