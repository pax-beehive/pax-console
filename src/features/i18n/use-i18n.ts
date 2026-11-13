"use client";

import { useLocaleStore } from "./locale-store";
import { translators } from "./translate";

export type { Locale, Translator, TranslationParams } from "./translate";

export function useI18n() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return { locale, setLocale, t: translators[locale] };
}
