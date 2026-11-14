import {
  Activity,
  Bell,
  Bot,
  FolderTree,
  KeyRound,
  Languages,
  LockKeyhole,
  Mic,
  Server,
  ShieldCheck,
  TerminalSquare,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";

export const settingsLinks = {
  home: "/settings",
  devices: "/settings/devices",
  agentSignIn: "/settings/agent-sign-in",
  projects: "/settings/projects",
  secretary: "/settings/secretary",
  encryption: "/settings/advanced/encryption",
  permissions: "/settings/advanced/permissions",
  language: "/settings/language",
  notifications: "/settings/notifications",
  voice: "/settings/voice",
  advanced: "/settings/advanced",
  apiKeys: "/settings/advanced/api-keys",
  registration: "/settings/advanced/node-registration",
  status: "/settings/service-status",
  addDevice: "/settings/devices/add",
  addAgent: "/settings/devices/agents/add",
} as const;

/**
 * Who sees a settings entry. "admin" follows the administrator view, so it is
 * hidden while previewing as a user. "grants" appears only for an account
 * that has standing agent permissions left to review.
 */
export type SettingsAudience = "everyone" | "admin" | "grants";

export type SettingsViewer = { admin: boolean; hasGrants: boolean };

export type SettingsSection = {
  id: string;
  href: string;
  title: string;
  caption: string;
  description: string;
  icon: LucideIcon;
  audience?: SettingsAudience;
  aliases?: readonly string[];
};

export type SettingsGroupDefinition = {
  id: string;
  title: string;
  /**
   * A directory group is one row on the settings overview that opens its own
   * page; the sidebar still lists its items.
   */
  directory?: { href: string; caption: string };
  items: readonly SettingsSection[];
};

/** The one settings directory shared by the sidebar and the overview. */
export const settingsGroups: readonly SettingsGroupDefinition[] = [
  {
    id: "devices",
    title: "Devices & agents",
    items: [
      {
        id: "devices",
        href: settingsLinks.devices,
        title: "My devices",
        icon: Server,
        caption: "Computers, servers, and their agents",
        aliases: ["/nodes", "/agents"],
        description:
          "Connect computers and servers, manage their agents, and inspect connection details.",
      },
      {
        id: "agentSignIn",
        href: settingsLinks.agentSignIn,
        title: "Agent sign-in & usage",
        icon: UserRoundCheck,
        caption: "Agent accounts and plan usage",
        description:
          "Sign in to the agents on a connected device, renew expired credentials, and check plan usage.",
      },
    ],
  },
  {
    id: "work",
    title: "Work",
    items: [
      {
        id: "projects",
        href: settingsLinks.projects,
        title: "Projects",
        icon: FolderTree,
        caption: "Workspaces and working folders",
        description:
          "Organize work into projects and configure reusable folders and agent targets for each workspace.",
      },
      {
        id: "secretary",
        href: settingsLinks.secretary,
        title: "Secretary",
        icon: Bot,
        caption: "Automatic conversation summaries",
        description:
          "Choose an agent to maintain summaries connected to your conversations, and track what has been summarized.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy & security",
    items: [
      {
        id: "encryption",
        href: settingsLinks.encryption,
        title: "Encrypted chats",
        icon: LockKeyhole,
        caption: "Encryption keys and device access",
        aliases: ["/e2ee/pairing"],
        description:
          "Manage this browser's encryption keys and authorize devices to open encrypted chats.",
      },
      {
        id: "permissions",
        href: settingsLinks.permissions,
        title: "Allowed actions",
        icon: ShieldCheck,
        caption: "Review and revoke agent permissions",
        audience: "grants",
        aliases: ["/approvals", "/settings/security"],
        description:
          "Review permissions previously given to agents, inspect their scope, and revoke access you no longer need.",
      },
    ],
  },
  {
    id: "general",
    title: "General",
    items: [
      {
        id: "language",
        href: settingsLinks.language,
        title: "Language & region",
        icon: Languages,
        caption: "Language and account region",
        description:
          "Choose the interface language for this browser, and see which region your account lives in.",
      },
      {
        id: "notifications",
        href: settingsLinks.notifications,
        title: "Notifications",
        icon: Bell,
        caption: "Alerts on this device",
        description:
          "Choose when this browser or Android app should notify you. Each device has its own subscription.",
      },
      {
        id: "voice",
        href: settingsLinks.voice,
        title: "Voice input",
        icon: Mic,
        caption: "Microphone for dictation",
        description:
          "Choose which microphone dictation uses on this device, so music in your earbuds can keep playing.",
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced settings",
    directory: {
      href: settingsLinks.advanced,
      caption: "API keys and manual device registration",
    },
    items: [
      {
        id: "apiKeys",
        href: settingsLinks.apiKeys,
        title: "API keys",
        icon: KeyRound,
        caption: "Access for scripts and applications",
        aliases: ["/settings/api-keys", "/settings/developer"],
        description:
          "Create and revoke access keys for scripts and applications that connect to PAX.",
      },
      {
        id: "registration",
        href: settingsLinks.registration,
        title: "Manual device registration",
        icon: TerminalSquare,
        caption: "Tokens for custom installations",
        aliases: ["/settings/node-registration"],
        description:
          "Create a device registration token for custom installation workflows. For a guided setup, use Add device instead.",
      },
    ],
  },
  {
    id: "admin",
    title: "Administrator",
    items: [
      {
        id: "status",
        href: settingsLinks.status,
        title: "Service status",
        icon: Activity,
        caption: "Service health and connections",
        audience: "admin",
        aliases: ["/monitor", "/settings/diagnostics"],
        description:
          "Check PAX service health alongside device and agent connections. Inspect offline resources and refresh their status.",
      },
    ],
  },
];

const sections = settingsGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, category: group.title })),
);

function isVisible(section: SettingsSection, viewer: SettingsViewer) {
  if (section.audience === "admin") return viewer.admin;
  if (section.audience === "grants") return viewer.hasGrants;
  return true;
}

/** Groups and entries this viewer should see; empty groups are dropped. */
export function visibleSettingsGroups(viewer: SettingsViewer) {
  return settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isVisible(item, viewer)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The settings entry a path belongs to; the overview and directories have none. */
export function settingsSectionForPath(pathname: string) {
  return sections.find((item) =>
    [item.href, ...(item.aliases ?? [])].some(
      (href) => pathname === href || pathname.startsWith(href + "/"),
    ),
  );
}

export function isSettingsRoute(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    Boolean(settingsSectionForPath(pathname))
  );
}

export function settingsSection(id: string) {
  return sections.find((item) => item.id === id)!;
}
