"use client";

import {
  Activity,
  FolderTree,
  KeyRound,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { useAgents, useHealth, useNodes } from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { serviceHealth } from "./service-health";
import {
  SettingsBack,
  SettingsGroup,
  SettingsLink,
  settingsLinks,
} from "./settings-navigation";

export function SettingsPage({ advanced = false }: { advanced?: boolean }) {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="mx-auto grid max-w-2xl gap-6">
              <header>
                {advanced && <SettingsBack />}
                <h1 className="text-2xl font-semibold">
                  {advanced ? "Advanced settings" : "Settings"}
                </h1>
                <p className="mt-2 text-sm text-ink-tertiary">
                  {advanced
                    ? "Permissions and developer tools. Most people can leave these settings as they are."
                    : "Manage your devices, projects, and service health."}
                </p>
              </header>
              {advanced ? (
                <>
                  <SettingsGroup>
                    <SettingsLink
                      href={settingsLinks.permissions}
                      icon={ShieldCheck}
                      title="Allowed actions"
                      description="Review or revoke permissions previously given to agents."
                    />
                    <SettingsLink
                      href={settingsLinks.encryption}
                      icon={ShieldCheck}
                      title="Encrypted chats"
                      description="Give this browser or another device access to encrypted chats."
                    />
                  </SettingsGroup>
                  <SettingsGroup>
                    <SettingsLink
                      href={settingsLinks.apiKeys}
                      icon={KeyRound}
                      title="API keys"
                      description="Connect scripts and other apps to PAX."
                    />
                    <SettingsLink
                      href={settingsLinks.registration}
                      icon={TerminalSquare}
                      title="Manual device registration"
                      description="Create a registration token for custom installation workflows."
                    />
                  </SettingsGroup>
                  <p className="text-xs text-ink-tertiary">
                    Device versions, runtime information, browser audit, and
                    maintenance tools live in each device&apos;s details.
                  </p>
                </>
              ) : (
                <>
                  <SettingsGroup>
                    <SettingsLink
                      href={settingsLinks.devices}
                      icon={Server}
                      title="Devices"
                      description="Connect computers or servers and manage their agents."
                    />
                    <SettingsLink
                      href={settingsLinks.projects}
                      icon={FolderTree}
                      title="Projects"
                      description="Organize projects and their working folders."
                    />
                  </SettingsGroup>
                  <HomeHealth user={user} />
                  <SettingsGroup>
                    <SettingsLink
                      href={settingsLinks.advanced}
                      icon={Settings2}
                      title="Advanced settings"
                      description="Permissions, encrypted access, and developer tools."
                    />
                  </SettingsGroup>
                </>
              )}
            </div>
          </div>
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

function HomeHealth({ user }: { user: User }) {
  const nodes = useNodes(user.user_id);
  const agents = useAgents(user.user_id, "accessible", 30_000);
  const health = useHealth();
  const summary = serviceHealth({
    health: health.data,
    nodes: nodes.data?.nodes,
    agents: agents.data?.agents,
    loading: nodes.isLoading || agents.isLoading || health.isLoading,
    error: Boolean(nodes.error || agents.error || health.error),
  });
  return (
    <section>
      <h2 className="mb-2 text-xs text-ink-tertiary">Service status</h2>
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
