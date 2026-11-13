"use client";

import { Languages } from "lucide-react";
import { useI18n, type Locale } from "./use-i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <label className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink-muted focus-within:ring-2 focus-within:ring-accent/25">
      <Languages aria-hidden="true" className="h-4 w-4" />
      <select
        aria-label="Language / 语言"
        className="max-w-24 cursor-pointer bg-surface-1 py-1 text-ink outline-none"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
  );
}
