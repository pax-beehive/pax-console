"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import {
  Activity,
  Bell,
  Bot,
  FolderTree,
  KeyRound,
  Mail,
  Mic,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useDesktopSettings } from "./use-desktop-settings";
import { NotificationSettings } from "./notification-settings";
import { ResourcePageClient } from "@/components/resources/resource-page-client";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { useAgents, useHealth, useNodes } from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { serviceHealth } from "./service-health";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import {
  SettingsBack,
  SettingsGroup,
  SettingsLink,
  settingsLinks,
} from "./settings-navigation";

export function SettingsPage({ advanced = false }: { advanced?: boolean }) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();
  return (
    <AuthGate>
      {(user) =>
        desktop && advanced ? (
          <ResourcePageClient kind="grants" user={user} />
        ) : (
          <ConsoleLayout user={user}>
            {desktop ? (
              <NotificationSettings userId={user.user_id} />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:hidden">
                <div className="mx-auto grid max-w-2xl gap-6">
                  <header>
                    {advanced && <SettingsBack />}
                    <h1 className="text-2xl font-semibold">
                      {advanced ? t("Advanced settings") : t("Settings")}
                    </h1>
                    <p className="mt-2 text-sm text-ink-tertiary">
                      {advanced
                        ? t(
                            "Permissions and developer tools. Most people can leave these settings as they are.",
                          )
                        : t(
                            "Manage your devices, projects, and service health.",
                          )}
                    </p>
                  </header>
                  {advanced ? (
                    <>
                      <SettingsGroup>
                        <SettingsLink
                          href={settingsLinks.permissions}
                          icon={ShieldCheck}
                          title={t("Allowed actions")}
                          description={t(
                            "Review or revoke permissions previously given to agents.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.encryption}
                          icon={ShieldCheck}
                          title={t("Encrypted chats")}
                          description={t(
                            "Give this browser or another device access to encrypted chats.",
                          )}
                        />
                      </SettingsGroup>
                      <SettingsGroup>
                        <SettingsLink
                          href={settingsLinks.apiKeys}
                          icon={KeyRound}
                          title={t("API keys")}
                          description={t(
                            "Connect scripts and other apps to PAX.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.registration}
                          icon={TerminalSquare}
                          title={t("Manual device registration")}
                          description={t(
                            "Create a registration token for custom installation workflows.",
                          )}
                        />
                      </SettingsGroup>
                      <p className="text-xs text-ink-tertiary">
                        {t(
                          "Device versions, runtime information, browser audit, and maintenance tools live in each device's details.",
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <SettingsGroup>
                        <SettingsLink
                          href={settingsLinks.agentSignIn}
                          icon={KeyRound}
                          title={t("Agent sign-in")}
                          description={t(
                            "Sign in to Claude Code or Codex on a device and renew expired access.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.notifications}
                          icon={Bell}
                          title={t("Notifications")}
                          description={t(
                            "Enable push notifications and test this device.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.voice}
                          icon={Mic}
                          title={t("Voice input")}
                          description={t(
                            "Choose the microphone dictation uses on this device.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.devices}
                          icon={Server}
                          title={t("Devices")}
                          description={t(
                            "Connect computers or servers and manage their agents.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.secretary}
                          icon={Bot}
                          title={t("Secretary")}
                          description={t(
                            "Maintain automatic summaries and track conversation progress.",
                          )}
                        />
                        <SettingsLink
                          href={settingsLinks.projects}
                          icon={FolderTree}
                          title={t("Projects")}
                          description={t(
                            "Organize projects and their working folders.",
                          )}
                        />
                      </SettingsGroup>
                      <HomeHealth user={user} />
                      <SettingsGroup>
                        <SettingsLink
                          href={settingsLinks.advanced}
                          icon={Settings2}
                          title={t("Advanced settings")}
                          description={t(
                            "Permissions, encrypted access, and developer tools.",
                          )}
                        />
                        <SettingsLink
                          href={CONTACT_MAILTO}
                          icon={Mail}
                          title={t("Contact us")}
                          description={t(
                            "Questions or feedback? Email {email}.",
                            { email: CONTACT_EMAIL },
                          )}
                        />
                      </SettingsGroup>
                    </>
                  )}
                </div>
              </div>
            )}
          </ConsoleLayout>
        )
      }
    </AuthGate>
  );
}

function HomeHealth({ user }: { user: User }) {
  const { t } = useI18n();
  const nodes = useNodes(user.user_id);
  const agents = useAgents(user.user_id, "accessible", 30_000);
  const health = useHealth();
  const summary = serviceHealth({
    t,
    health: health.data,
    nodes: nodes.data?.nodes,
    agents: agents.data?.agents,
    loading: nodes.isLoading || agents.isLoading || health.isLoading,
    error: Boolean(nodes.error || agents.error || health.error),
  });
  return (
    <section>
      <h2 className="mb-2 text-xs text-ink-tertiary">{t("Service status")}</h2>
      <SettingsGroup>
        <SettingsLink
          href={settingsLinks.status}
          icon={Activity}
          title={summary.title}
          description={summary.description}
        />
      </SettingsGroup>
    </section>
  );
}
