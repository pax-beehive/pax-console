import type { Locale } from "./translate";

/** Each language is named in itself so it stays recognizable in any locale. */
export const languageNames: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};
