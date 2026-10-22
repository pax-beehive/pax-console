# Settings inventory and organization

Settings has eight primary sections. The desktop navigation shows all sections
in four groups; `/settings` opens Notifications directly on desktop. Mobile keeps
the original Settings directory, Advanced settings list, and per-page back links;
it has no section selector. Account reload/sign-out remain in the
user menu. Administrator customer and push-subscription analytics remain in
the workspace administrator navigation.

| Group             | Section             | Existing capabilities                                                                                                                      | Canonical route                                 |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Workspace         | Notifications       | Device opt-in/out, subscription confirmation, test delivery, latest-attempt status; explanations of completed replies and manual approvals | `/settings/notifications`                       |
| Workspace         | Devices & agents    | Connect a device, add an agent, switch between device and agent lists, filter active resources, inspect details                            | `/settings/devices` (`?view=agents` for agents) |
| Workspace         | Projects            | Create/edit/archive projects, organize hierarchy, configure reusable agent and working-folder targets                                      | `/settings/projects`                            |
| Security & access | Allowed actions     | Review persistent agent grants, inspect scope, revoke permission                                                                           | `/settings/advanced/permissions`                |
| Security & access | Encrypted chats     | Save/remove browser encryption keys, manage encrypted-device access and pairing                                                            | `/settings/advanced/encryption`                 |
| Developer tools   | API keys            | Create named keys, copy the secret at creation, revoke keys                                                                                | `/settings/advanced/api-keys`                   |
| Developer tools   | Device registration | Generate registration tokens for custom installation workflows                                                                             | `/settings/advanced/node-registration`          |
| Status & support  | Service status      | Check PAX health, device/agent connection states, recent sessions, and refresh reports                                                     | `/settings/service-status`                      |

Device and agent detail pages retain runtime information, browser controls,
maintenance, upgrades, secret channels, and deletion where previously available.
These are contextual device actions, not additional top-level settings.
Guided Add device/Add agent remains under Devices; manual registration stays
under Developer tools to distinguish ordinary setup from custom integration.

`/settings/advanced` opens Allowed actions on desktop and retains the Advanced
settings directory on mobile. Existing API-key,
registration, diagnostics, and security aliases retain their redirects. No
resource API, permission boundary, notification subscription, or persisted
workspace sidebar preference is changed by the navigation reorganization.
