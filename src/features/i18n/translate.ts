import { configMessages } from "./messages/config";
import { resourcesMessages } from "./messages/resources";
import { homeMessages } from "./messages/home";
import { consoleMessages } from "./messages/console";
import { commonMessages } from "./messages/common";
import { sessionsMessages } from "./messages/sessions";

export type Locale = "en" | "zh-CN";
export type TranslationParams = Record<string, string | number>;
export type Translator = (
  message: string,
  params?: TranslationParams,
) => string;

const messages: Record<string, string> = {
  ...commonMessages,
  ...consoleMessages,
  ...homeMessages,
  ...resourcesMessages,
  ...sessionsMessages,
  ...configMessages,
};

export function resolveLocale(
  saved: string | null,
  languages: readonly string[],
): Locale {
  if (saved === "en" || saved === "zh-CN") return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

export function createTranslator(locale: Locale): Translator {
  return (message, params) => {
    const translated =
      locale === "zh-CN" && Object.hasOwn(messages, message)
        ? messages[message]
        : message;
    return translated.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
      params && Object.hasOwn(params, key) ? String(params[key]) : placeholder,
    );
  };
}

export const translators = {
  en: createTranslator("en"),
  "zh-CN": createTranslator("zh-CN"),
};
