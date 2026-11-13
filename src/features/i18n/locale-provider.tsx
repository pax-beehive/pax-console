"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  browserPreferredLanguages,
  initializeLocale,
  LOCALE_STORAGE_KEY,
  useLocaleStore,
} from "./locale-store";
import { resolveLocale } from "./translate";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useLocaleStore((state) => state.locale);
  useEffect(() => {
    initializeLocale();
    const sync = (event: StorageEvent) => {
      if (event.storageArea) {
        try {
          if (event.storageArea !== window.localStorage) return;
        } catch {
          return;
        }
      }
      if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
        useLocaleStore.setState({
          locale: resolveLocale(event.newValue, browserPreferredLanguages()),
        });
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    // Public overview pages already have their own explicit language routes.
    document.documentElement.lang =
      pathname === "/zh/overview"
        ? "zh-CN"
        : pathname === "/overview"
          ? "en"
          : locale;
  }, [locale, pathname]);
  return children;
}
