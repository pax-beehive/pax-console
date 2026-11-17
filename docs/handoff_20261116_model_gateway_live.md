# Model gateway administration on the current live Console

Base: `a3adba32be7a63a426b0bf8b9024c743cf6b7797`, the immutable image revision
running on the US Console on November 16, 2026. The container retained an older
revision label; this branch uses the image's actual source revision. The existing
Runtime configuration page is present at this base.

This candidate adds `/admin/model-gateway` to the current Administrator Settings
catalog and administration subnavigation. It provides the monthly platform pool,
default allowances, per-user caps and pause, configured model policies, request
accounting outcomes and change audit. English and simplified Chinese use the
current translation infrastructure; every pre-existing catalog is unchanged.
The mobile page has the existing Settings back link.

The isolated port has no free-agent/sandbox lifecycle imports or home/session
changes. Existing WorkOS authentication, same-origin API proxy, Settings layout,
feature flags, generic runtime configuration, regional routing and other admin
pages are unchanged. It adds one shared-settings catalog entry and one admin
subnavigation link alongside the existing ones.

Deploy the matching Manager administration API and persistent hosting store before
publishing this page: GET/PATCH `/api/v1/user/self/hosting-admin`. The existing
browser API proxy forwards this self-scoped path. Manager remains authoritative
for administrator access, monthly periods, atomic reservations, version checks,
model-base preconditions and audit. The page targets the signed-in account's
current regional Manager; it does not add cross-region hosting administration.

The initial rollout can keep hosting disabled, the platform pool at zero and all
models disabled. Opening or saving management settings does not make a generation
request. This candidate does not provision a sandbox, deploy Lambda, activate
provider credentials, choose production models or add paid credit. The example
values in tests and browser screenshots are fictional fixtures only.

Validation uses Node 24.18.0 and the base's unchanged pnpm lockfile with Next
16.2.9. Focused tests cover the UI/API, zero-pool disabled hosting, exact microdollar
inputs, version conflicts and preserved drafts, pause-only writes, model-base
changes, administrator preview/role loss, Settings visibility, generic config
administration, runtime-config hooks, feature routes and translation placeholders.
The browser fixture in `scripts/model-gateway-smoke` intercepts all APIs and blocks
external traffic. Screenshots and pass/fail results remain local test artifacts.

Validation completed locally:

- 111 focused tests passed across 10 UI/API/Settings/config/auth/i18n files.
- TypeScript and whole-`src` ESLint passed; changed files pass Prettier.
- Next production webpack build passed with the new route and every existing
  administrator route present in `app-paths-manifest.json`.
- Production-server Playwright smoke passed: 7 fictional administration reads,
  4 explicit fictional writes, desktop/mobile layout, current Settings links,
  Preview as user, conflicts, denied reads and ordinary-user isolation. There
  were no unmocked API requests or browser JavaScript errors. Screenshots are
  local artifacts under `/tmp/pax-model-gateway-live-console-20261116`.
- A protected-path comparison against the base confirms no changes to auth,
  API routes/proxy, shell layout/navigation, flags, generic config components,
  runtime-config hooks or any existing translation catalog.

Build and deployment must follow the repository's existing image workflow. This
branch alone does not update any live service or authorize generation traffic.
