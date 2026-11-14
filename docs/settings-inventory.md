# Settings inventory and organization

`settings/settings-catalog.ts` is the one settings directory. The desktop
sidebar and the `/settings` overview both render it, so wide and narrow screens
list the same entries in the same groups. `/settings` is the overview on every
screen size.

| Group              | Entry                      | Who sees it                               | Existing capabilities                                                                                                                                                                                                        | Canonical route                        |
| ------------------ | -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Devices & agents   | My devices                 | Everyone                                  | Each device with the agents that run on it; add a device or an agent; rename, update, or delete a device; change an agent's name, description, local-session syncing and session limit; sign in, restart, or delete an agent | `/settings/devices`                    |
| Devices & agents   | Agent sign-in & usage      | Everyone                                  | Claude subscription/Console authorization; Codex device code, API key or access token; renew expired access; plan usage                                                                                                      | `/settings/agent-sign-in`              |
| Work               | Projects                   | Everyone                                  | Create/edit/archive projects, organize hierarchy, configure reusable agent and working-folder targets                                                                                                                        | `/settings/projects`                   |
| Work               | Secretary                  | Accounts with the `secretary` feature     | Choose one owned agent, enable automatic summaries, inspect published coverage and remaining conversations                                                                                                                   | `/settings/secretary`                  |
| Privacy & security | Encrypted chats            | Everyone                                  | Save/remove browser encryption keys, manage encrypted-device access and pairing                                                                                                                                              | `/settings/advanced/encryption`        |
| Privacy & security | Allowed actions            | Accounts with a standing agent permission | Review persistent agent grants, inspect scope, revoke permission                                                                                                                                                             | `/settings/advanced/permissions`       |
| General            | Language & region          | Everyone                                  | Choose the interface language for this browser; see the account region when the deployment assigns one                                                                                                                       | `/settings/language`                   |
| General            | Notifications              | Accounts with the `notifications` feature | Device opt-in/out, subscription confirmation, test delivery, latest-attempt status; explanations of completed replies and manual approvals                                                                                   | `/settings/notifications`              |
| General            | Voice input                | Accounts with the `voice_input` feature   | Choose the dictation microphone for this device                                                                                                                                                                              | `/settings/voice`                      |
| Advanced settings  | API keys                   | Everyone                                  | Create named keys, copy the secret at creation, revoke keys                                                                                                                                                                  | `/settings/advanced/api-keys`          |
| Advanced settings  | Manual device registration | Everyone                                  | Generate registration tokens for custom installation workflows                                                                                                                                                               | `/settings/advanced/node-registration` |
| Administrator      | Service status             | Administrators                            | Check PAX health, device/agent connection states, recent sessions, and refresh reports                                                                                                                                       | `/settings/service-status`             |

Visibility is decided in one place, `use-settings-visibility.ts`:

- **Feature entries** (Secretary, Notifications, Voice input) declare a
  `feature` and are listed only while `useFeatures` reports it enabled for the
  account, which Manager decides from the runtime feature flags. Their routes
  are wrapped in `FeatureRoute`, so opening one without the feature returns to
  the overview. Manager rejects the same features' API calls on its own.
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

My devices is one page: a card per device with its agents listed inside, online
devices first and offline ones kept. People see names, presence and whether an
agent's account is signed in; identifiers and versions are left out. The device
and agent detail pages (`/nodes/[id]`, `/agents/[id]`) hold runtime information,
raw metadata, browser controls, the remaining maintenance and manual connection
setup; they open for administrators only, from Runtime details in each menu.
Guided Add device/Add agent remains under My devices; manual registration stays under Advanced settings to
distinguish ordinary setup from custom integration. Administrator customer and
push-subscription analytics remain in the workspace administrator navigation.

Existing API-key, registration, diagnostics, and security aliases retain their
redirects; `/settings/security` opens Allowed actions.
