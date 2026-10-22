import {
  Activity,
  Bell,
  FolderTree,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

export const settingsLinks = {
  home: "/settings",
  devices: "/settings/devices",
  projects: "/settings/projects",
  status: "/settings/service-status",
  notifications: "/settings/notifications",
  advanced: "/settings/advanced",
  permissions: "/settings/advanced/permissions",
  encryption: "/settings/advanced/encryption",
  apiKeys: "/settings/advanced/api-keys",
  registration: "/settings/advanced/node-registration",
  addDevice: "/settings/devices/add",
  addAgent: "/settings/devices/agents/add",
} as const;

export type SettingsSection = {
  id: string;
  href: string;
  title: string;
  caption: string;
  description: string;
  icon: LucideIcon;
  aliases?: readonly string[];
};

export const settingsGroups: readonly {
  title: string;
  items: readonly SettingsSection[];
}[] = [
  {
    title: "Workspace",
    items: [
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
        id: "devices",
        href: settingsLinks.devices,
        title: "Devices & agents",
        icon: Server,
        caption: "Computers, servers, and agents",
        aliases: ["/nodes", "/agents"],
        description:
          "Connect computers and servers, manage their agents, and inspect connection details.",
      },
      {
        id: "projects",
        href: settingsLinks.projects,
        title: "Projects",
        icon: FolderTree,
        caption: "Workspaces and working folders",
        description:
          "Organize work into projects and configure reusable folders and agent targets for each workspace.",
      },
    ],
  },
  {
    title: "Security & access",
    items: [
      {
        id: "permissions",
        href: settingsLinks.permissions,
        title: "Allowed actions",
        icon: ShieldCheck,
        caption: "Review and revoke agent permissions",
        aliases: ["/approvals", "/settings/security"],
        description:
          "Review permissions previously given to agents, inspect their scope, and revoke access you no longer need.",
      },
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
    ],
  },
  {
    title: "Developer tools",
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
        title: "Device registration",
        icon: TerminalSquare,
        caption: "Tokens for custom installations",
        aliases: ["/settings/node-registration"],
        description:
          "Create a device registration token for custom installation workflows. For a guided setup, use Add device instead.",
      },
    ],
  },
  {
    title: "Status & support",
    items: [
      {
        id: "status",
        href: settingsLinks.status,
        title: "Service status",
        icon: Activity,
        caption: "Service health and connections",
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

export function settingsSectionForPath(pathname: string) {
  if (pathname === settingsLinks.home) return sections[0];
  if (pathname === settingsLinks.advanced)
    return sections.find((item) => item.id === "permissions");
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
