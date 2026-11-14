"use client";
import { useI18n, type Locale } from "@/features/i18n/use-i18n";

import { Globe, Languages } from "lucide-react";
import {
  SettingsChoice,
  SettingsChoices,
} from "@/components/ui/settings-controls";
import { languageNames } from "@/features/i18n/language-names";
import { accountRegionName } from "@/features/region/account-region";
import { settingsSection } from "./settings-catalog";
import { SettingsBack, SettingsPageHeader } from "./settings-navigation";

export function LanguageSettings() {
  const { t, locale, setLocale } = useI18n();
  const section = settingsSection("language");
  const region = accountRegionName();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hidden lg:block">
        <SettingsPageHeader
          title={section.title}
          category={section.category}
          description={section.description}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:px-8 lg:py-6">
        <div className="mx-auto w-full max-w-2xl lg:max-w-5xl">
          <div className="grid gap-5 lg:max-w-3xl">
            <header className="lg:hidden">
              <SettingsBack />
              <h1 className="text-2xl font-semibold">{t(section.title)}</h1>
              <p className="mt-2 text-sm text-ink-tertiary">
                {t(section.caption)}
              </p>
            </header>
            <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5 lg:p-6">
              <h2 className="flex items-center gap-2 font-medium">
                <Languages className="h-4 w-4" />
                {t("Language")}
              </h2>
              <SettingsChoices label={t("Interface language")}>
                {(Object.keys(languageNames) as Locale[]).map((value) => (
                  <SettingsChoice
                    key={value}
                    label={languageNames[value]}
                    selected={locale === value}
                    onClick={() => setLocale(value)}
                  />
                ))}
              </SettingsChoices>
              <p className="text-xs text-ink-tertiary">
                {t("Saved in this browser only.")}
              </p>
            </section>
            {region && (
              <section className="grid gap-2 rounded-xl border border-hairline bg-surface-1 p-5 lg:p-6">
                <h2 className="flex items-center gap-2 font-medium">
                  <Globe className="h-4 w-4" />
                  {t("Account region")}
                </h2>
                <p className="text-sm text-ink">{t(region)}</p>
                <p className="text-xs text-ink-tertiary">
                  {t("Your projects and devices stay in this region.")}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
