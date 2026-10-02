# Settings migration — 2026-09-27

The implemented UI is English first. Settings is now a real directory with
Devices, Projects, Service status and Advanced settings. This changes navigation
and presentation while retaining the existing resource operations.

## Before / after and retained behavior

| Existing area | New location | Retained functionality |
| --- | --- | --- |
| Devices / Nodes | Settings → Devices | Active/all filters, details, profile editing, runtime information, confirmed restart/upgrade and deletion |
| Agents | Devices → Agents and device details | Agent profiles, routing tags, skills, specialties, capability notes, labels, notes, recent sessions and deletion |
| paxd runtime | Device details | Harness discovery, create/edit agent connections, slots, working directory, instance ID, local-session sync, start/stop/restart/remove |
| Browser control | Device details | Global pause, site requests and allowlist, watch/control sessions and tabs, input forwarding, Docker VNC, one-use password, sensitive-input resume and audit |
| Device secrets | Device → Advanced device settings | Existing encrypted secret transfer; cleanup confirmation retained |
| Projects | Settings → Projects | Project hierarchy, create/edit/archive, Targets with Agent, working directory, enabled/default state; URL-based selection supports browser history |
| Security grants | Advanced settings → Allowed actions | Review/revoke persistent grants; pending decisions remain in Home |
| Encryption | Advanced settings → Encrypted chats | Per-agent browser keys, generation/copy/import/removal; existing-device and computer-based pairing plus request approval remain on the pairing page |
| Developer / API keys | Advanced settings → API keys | Create, one-time secret display/copy, revoke |
| Developer / Node registration | Advanced settings → Manual device registration | Existing manual token and lifetime controls |
| Diagnostics | Settings → Service status | PAX health, online device count, active agent count, recent sessions; adds separate connection states and detail links |
| Existing pairing | Devices → Add device → Browser sign-in | Complete installer command, terminal sign-in link, original `/connect` review and approval |
| New quick registration | Devices → Add device → Quick connect | Generate/copy installer command; one-use token; expiry/regeneration; newly registered device detection |

Technical metadata and profile routing fields are expandable. Existing business
components remain responsible for their mutations; this is not a rewrite of
browser control, daemon management or encryption protocols.

## Compatibility

- `/settings/security` → `/settings/advanced` (both grants and encryption).
- `/settings/developer` → `/settings/advanced/api-keys`.
- `/settings/developer?view=node-registration` → manual registration.
- `/settings/api-keys` and `/settings/node-registration` → their advanced pages.
- `/settings/diagnostics` → `/settings/service-status`.
- `/approvals` → persistent permissions; `/monitor` continues through its legacy redirect.
- Device, Agent, Project and encryption-pairing deep links remain available.

## Quick connect implementation and release dependency

Console posts `{expires_in_seconds: 3600}` to the same-origin authenticated token
endpoint. It omits the admin-only owner override, so ordinary users can create
tokens for themselves. The generated shell command uses the configured public
runtime origin and quotes interpolated values. It invokes the paxd public installer
once with `PAX_SETUP_AFTER_INSTALL=1`; that installer installs both paxl and paxd
before setup. Bash pipefail propagates download/install failures. Browser sign-in
uses the same full command but explicitly clears any inherited token. Token and
command stay in component memory, outside Query/mutation caches. Detection lists
newly online computers since command generation; users choose their computer,
and the UI does not claim to correlate a specific token with a device.

The paxd installer forwards `--registration-token-env`. Setup clears the token
environment before starting the service, exchanges the token using the existing
registration endpoint and saves credentials through the existing owner-only
storage path. Existing configured devices are rejected before registration.
Setup without this flag retains browser pairing.

**Release the matching paxd binary and installer before the Console change.**
No production registration or deployment was performed for this migration.

## Verification

- Targeted frontend regression: 125 passed, one existing skipped test across
  11 files (projects, settings, resources, API and Home).
- Production Next.js build, TypeScript typecheck and scoped ESLint passed.
- Playwright with intercepted API fixtures at 1280px and 390px: directory and
  advanced-page navigation, parent/browser back, projects entry, both setup
  methods, token request body, legacy redirects and no horizontal overflow or
  browser runtime errors. Device-online/agent-offline fixture stays degraded.
- paxd CLI Go tests passed, including token exchange, persisted credential mode,
  service lifecycle, clearing inherited secrets, error paths and configured-device
  protection; existing pairing tests remain.
- Installer shell suite: all 12 checks passed, including token and pairing dispatch.

Browser checks use fixtures. They do not substitute for a post-release fresh-machine
installation against the deployed manager and artifact service, or a live test of
all browser-control and hardware-dependent operations.

Re-run browser checks with a local Console server:

```sh
SETTINGS_CHECK_URL=http://localhost:3017 node scripts/settings-browser-check.cjs
```

The script uses the installed Chrome channel and intercepts all `/api/pax/**`
requests. Keep the Console API base at its default same-origin proxy.

Quick-connect command regression tests execute a mocked installer in bash: one
installer is called, download/install failures propagate, shell metacharacters
remain literal, and browser sign-in clears an inherited token. No real downloads,
installs, or registrations are performed by these tests.

## Two-step onboarding verification

The shared flow now serves Home/resource empty states, Add device, Add agent,
and the node-specific Connect an agent link. Agent discovery distinguishes a
missing adapter from npx fallback and leaves agent installation/sign-in explicitly
unverified. Creation polls the matching runtime generation, retries an existing
failed connection, and offers Start a conversation only once connected.

- 63 tests passed and one existing test skipped across onboarding, command shell
  execution, daemon controls, and Home regressions.
- Production Next.js build, TypeScript and scoped ESLint passed.
- Mocked browser checks cover desktop/mobile layout, both device connection
  methods, ACP installation help, refresh, runtime success, node preselection,
  and retaining Home's completion screen when the new agent enters the cache.

Reproduce against a local server (screenshots go to `/tmp/pax-onboarding-*.png`):

```sh
ONBOARDING_CHECK_URL=http://127.0.0.1:3013 node scripts/onboarding-browser-check.cjs
```

The script defaults to installed Chrome. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
to use another local Chromium binary. These fixtures do not test a live Agent
account or install software on a fresh machine.
