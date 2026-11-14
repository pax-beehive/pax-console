# Settings inventory and organization

`settings/settings-catalog.ts` is the one settings directory. The desktop
sidebar and the `/settings` overview both render it, so wide and narrow screens
list the same entries in the same groups. `/settings` is the overview on every
screen size.

| Group              | Entry                      | Who sees it                               | Existing capabilities                                                                                                                      | Canonical route                                 |
| ------------------ | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Devices & agents   | My devices                 | Everyone                                  | Connect a device, add an agent, switch between device and agent lists, filter active resources, inspect details                            | `/settings/devices` (`?view=agents` for agents) |
| Devices & agents   | Agent sign-in & usage      | Everyone                                  | Claude subscription/Console authorization; Codex device code, API key or access token; renew expired access; plan usage                    | `/settings/agent-sign-in`                       |
| Work               | Projects                   | Everyone                                  | Create/edit/archive projects, organize hierarchy, configure reusable agent and working-folder targets                                      | `/settings/projects`                            |
| Work               | Secretary                  | Everyone                                  | Choose one owned agent, enable automatic summaries, inspect published coverage and remaining conversations                                 | `/settings/secretary`                           |
| Privacy & security | Encrypted chats            | Everyone                                  | Save/remove browser encryption keys, manage encrypted-device access and pairing                                                            | `/settings/advanced/encryption`                 |
| Privacy & security | Allowed actions            | Accounts with a standing agent permission | Review persistent agent grants, inspect scope, revoke permission                                                                           | `/settings/advanced/permissions`                |
| General            | Language & region          | Everyone                                  | Choose the interface language for this browser; see the account region when the deployment assigns one                                     | `/settings/language`                            |
| General            | Notifications              | Everyone                                  | Device opt-in/out, subscription confirmation, test delivery, latest-attempt status; explanations of completed replies and manual approvals | `/settings/notifications`                       |
| General            | Voice input                | Everyone                                  | Choose the dictation microphone for this device                                                                                            | `/settings/voice`                               |
| Advanced settings  | API keys                   | Everyone                                  | Create named keys, copy the secret at creation, revoke keys                                                                                | `/settings/advanced/api-keys`                   |
| Advanced settings  | Manual device registration | Everyone                                  | Generate registration tokens for custom installation workflows                                                                             | `/settings/advanced/node-registration`          |
| Administrator      | Service status             | Administrators                            | Check PAX health, device/agent connection states, recent sessions, and refresh reports                                                     | `/settings/service-status`                      |

Visibility is decided in one place, `use-settings-visibility.ts`:

- **Administrators** follow `canSeeAdminFeatures`, so the Administrator group
  disappears while an administrator previews as a user.
- **Allowed actions** appears only while the account has an unrevoked approval
  grant. The web console grants one-off approvals only; standing grants come
  from clients that offer broader choices, and this page is where they are
  revoked. The route stays reachable by URL.

The overview shows each group as a card. Advanced settings is one row there
that opens `/settings/advanced`, a directory of its two tools; the sidebar lists
them directly. Contact us is in the sidebar footer, on the narrow overview, and
in the account menu.

The account menu (top right) names the signed-in account and its region, then
lists the language choice, Settings and Contact us, Reload and the
administrator's Preview as user, and Sign out. Language & region and the menu
change the same language preference.

Device and agent detail pages retain runtime information, browser controls,
maintenance, upgrades, secret channels, and deletion. These are contextual
device actions, not additional top-level settings. Guided Add device/Add agent
remains under My devices; manual registration stays under Advanced settings to
distinguish ordinary setup from custom integration. Administrator customer and
push-subscription analytics remain in the workspace administrator navigation.

Existing API-key, registration, diagnostics, and security aliases retain their
redirects; `/settings/security` opens Allowed actions.
