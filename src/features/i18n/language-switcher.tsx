"use client";

import { Languages } from "lucide-react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "./use-i18n";

/** Language preferences are part of the existing user menu. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2">
        <Languages aria-hidden="true" className="h-3.5 w-3.5" />
        {t("Language")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label="Language / 语言"
        value={locale}
        onValueChange={(value) => {
          if (value === "en" || value === "zh-CN") setLocale(value);
        }}
      >
        <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
