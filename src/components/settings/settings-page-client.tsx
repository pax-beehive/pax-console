"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { Mail, Settings2 } from "lucide-react";
import { isDeviceNode } from "@/components/resources/resource-models";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { useNodes } from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { languageNames } from "@/features/i18n/language-names";
import { accountRegionName } from "@/features/region/account-region";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { settingsGroups } from "./settings-catalog";
import {
  SettingsBack,
  SettingsGroup,
  SettingsLink,
} from "./settings-navigation";
import { useVisibleSettingsGroups } from "./use-settings-visibility";

const pageClass = "min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:px-8 lg:py-7";

/** `/settings` is the overview; `/settings/advanced` lists the advanced group. */
export function SettingsPage({ advanced = false }: { advanced?: boolean }) {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          {advanced ? <AdvancedDirectory /> : <SettingsOverview user={user} />}
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

function SettingsOverview({ user }: { user: User }) {
  const { t } = useI18n();
  const groups = useVisibleSettingsGroups();
  const hints = useOverviewHints(user.user_id);
  const directories = groups.filter((group) => group.directory);
  return (
    <div className={pageClass}>
      <div className="mx-auto grid max-w-2xl gap-6 lg:max-w-5xl">
        <header>
          <h1 className="text-2xl font-semibold">{t("Settings")}</h1>
          <p className="mt-2 text-sm text-ink-tertiary">
            {t("Manage your devices, agents, and projects.")}
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {groups
            .filter((group) => !group.directory)
            .map((group) => (
              <section key={group.id} aria-label={t(group.title)}>
                <h2 className="mb-2 text-xs text-ink-tertiary">
                  {t(group.title)}
                </h2>
                <SettingsGroup>
                  {group.items.map((item) => (
                    <SettingsLink
                      key={item.id}
                      href={item.href}
                      icon={item.icon}
                      title={item.title}
                      description={item.caption}
                      trailing={
                        hints[item.id] && (
                          <span className="shrink-0 text-xs text-ink-tertiary">
                            {hints[item.id]}
                          </span>
                        )
                      }
                    />
                  ))}
                </SettingsGroup>
              </section>
            ))}
          {/* The desktop sidebar already lists these entries. */}
          <div className="lg:hidden">
            <SettingsGroup>
              {directories.map((group) => (
                <SettingsLink
                  key={group.id}
                  href={group.directory!.href}
                  icon={Settings2}
                  title={group.title}
                  description={group.directory!.caption}
                />
              ))}
              <SettingsLink
                href={CONTACT_MAILTO}
                icon={Mail}
                title="Contact us"
                description={t("Questions or feedback? Email {email}.", {
                  email: CONTACT_EMAIL,
                })}
              />
            </SettingsGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cheap, already-cached facts shown beside an overview entry. */
function useOverviewHints(userId: string): Record<string, string | undefined> {
  const { t, locale } = useI18n();
  const devices = useNodes(userId, 60_000).data?.nodes?.filter(isDeviceNode);
  const region = accountRegionName();
  return {
    devices: devices?.length
      ? t("{count} online", {
          count: devices.filter((node) => node.online).length,
        })
      : undefined,
    language: [languageNames[locale], region && t(region)]
      .filter(Boolean)
      .join(" · "),
  };
}

function AdvancedDirectory() {
  const { t } = useI18n();
  const group = settingsGroups.find((item) => item.id === "advanced")!;
  return (
    <div className={pageClass}>
      <div className="mx-auto grid max-w-2xl gap-6">
        <header>
          <SettingsBack />
          <h1 className="text-2xl font-semibold">{t(group.title)}</h1>
          <p className="mt-2 text-sm text-ink-tertiary">
            {t(
              "Tools for scripts and custom installations. Most people can leave these settings as they are.",
            )}
          </p>
        </header>
        <SettingsGroup>
          {group.items.map((item) => (
            <SettingsLink
              key={item.id}
              href={item.href}
              icon={item.icon}
              title={item.title}
              description={item.caption}
            />
          ))}
        </SettingsGroup>
      </div>
    </div>
  );
}
