# Administrator summary inspection handoff

## Delivery scope

`/admin/summaries` is a read-only developer view of the current administrator's
own readable summaries. Administrator status does not grant access to another
user's summary or original messages. The list contains current versions; direct
ID lookup can request a specific immutable revision.

The Console branch is `codex/admin-summary-browser`, based on main `8ac9c1f`, in
`work/summary-admin-console`. Pair this change with the Manager developer-summary
API work in `work/summary-admin-manager`. Deploy those Manager endpoints before
the Console: an older backend produces a visible API error. This page reads PG
through Manager and does not depend on an ES index or a keyword query.

The page includes cursor pagination, refresh, direct summary ID/revision lookup,
full summary text, subject and version metadata, claims, exact source references,
and a text-only Raw JSON disclosure. Existing source readers preserve frozen
message hashes and child summary revisions. Desktop has list/detail panes;
mobile opens detail with a Back to summaries control. Real browser acceptance
against the paired isolated Manager is recorded below.

## Authorization and state

`SummaryBrowserAccess` checks the existing `canSeeAdminFeatures` helper before
mounting data queries. Ordinary users and Preview as user see an explicit denial
and do not mount list or detail requests. Changing the signed-in user remounts
the browser. The desktop sidebar link is admin-only; mobile uses the existing
Customers administration entry and shared tabs without adding a bottom item.

Manager independently enforces administrator status, current ownership and
source access. Browser requests always use `/api/v1/user/self`; components cannot
select a different owner. Both list and detail authentication failures hide
cached protected content. Detail and nested evidence/source 401/403 responses
also hide the list and close the source panel until an explicit refresh. The
shared reader's optional denial callback is wired only for the developer view;
ordinary search retains its existing source-error and dismissal behavior.
A missing historical version remains unavailable; the page does not silently
substitute the current revision.

TanStack Query owns server data. Keys include administrator identity and, for
detail, summary ID and revision. Form values, selection and source expansion
stay in page-local React state. Summary bodies, cursors, source receipts and
JSON are not persisted in Zustand or browser storage. Raw JSON is rendered as
React text, without HTML injection.

## Files and paired API

- `src/app/admin/summaries/page.tsx`: App Router entry.
- `src/components/admin/summary-browser.tsx`: authorization gate, list, direct
  lookup, refresh and responsive pane selection.
- `src/components/admin/summary-developer-detail.tsx`: exact version detail,
  source navigation and raw JSON.
- `src/features/api/developer-summaries.ts`: typed same-origin API and queries.
- `src/components/search/search-source-panel.tsx`: exports the existing
  `SummaryContent` renderer for reuse and an optional `onAccessDenied` callback
  for the developer view.
- Sidebar, mobile navigation and `AdminAnalyticsNav`: admin entry points.
- `docs/architecture.zh.md` and `docs/agent-operating-guide.md`: API, auth,
  state ownership and operating guidance.

The new requests use the existing `/api/pax` proxy:

```text
GET /api/v1/user/self/developer/summaries?limit=20&cursor=<opaque>
GET /api/v1/user/self/developer/summaries/:summary_id?revision=N
```

List responses are `{items, next_cursor?}`. Each item contains `summary_id`,
`revision`, `subject_type`, `subject_id`, `title`, `body_preview`, `claim_count`,
`coverage_count`, `summary_source_count` and `created_at`. Manager returns a
400-character preview and bounds requests to 100 candidates; this UI requests
up to 20 candidates per page. Visibility checks can produce fewer visible rows.
An empty filtered page may still carry a continuation and must retain Load more.
Refresh clears detail selection and starts again from the first page.

Detail is `{summary: WorkspaceSummaryVersion}`. Omitting revision reads current;
the form accepts positive safe integers for exact revision reads. Evidence and
coverage use the existing `search/read` endpoint with precise source references.

No `issues/` convention exists in this Console checkout. No unrelated test
configuration, dependency versions, auth proxy or production settings changed.

## Verification

Verification used Node 24.19.0 from
`/Users/gengcongkai/.nvm/versions/node/v24.19.0/bin/node` and pnpm 10.33.0.
The repository Volta pin remains Node 24.14.1. Existing jsdom tests require
`NODE_OPTIONS=--no-experimental-webstorage` with the installed Node runtime.

Passed:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm exec vitest run src/features/api/developer-summaries.test.tsx \
  src/components/admin/summary-browser.test.tsx \
  src/components/search/workspace-search.test.tsx \
  src/components/shell/summary-navigation.test.tsx
node --test workers/public-pages/index.test.mjs
git diff --check
```

The final focused tests passed 52/52. They cover admin and preview gating,
cached-data
denial, same-origin requests, cache isolation, cursor restart and continuation,
exact historical/source references, cancellation, loading/empty/error states,
navigation, direct lookup and JSON inspection. Detail denial and all three
nested-source denial representations failed their regressions before the
cache-hiding fixes and passed afterward. Nested-source tests mount the real
source panel with mocked API hooks; a separate regression preserves ordinary
search dismissal without an administrator denial callback. Direct lookup has no
client-only summary ID length limit; a long-ID regression preserves that contract.

The full command used Node 24, the webstorage flag and local HTTP fixture
listener permission:

```bash
pnpm exec vitest run --maxWorkers=2
```

Before the final nested-source callback fix, the full run completed with 1,288
tests passed and two existing tests skipped. There were 156 passing Vitest files,
one skipped file, and one existing suite discovery
failure: `workers/public-pages/index.test.mjs` imports `node:test`, so Vitest
reports `No test suite found`. The file and its worker match unchanged HEAD.
The same failure reproduced when running that file alone under Vitest; its
correct native `node --test` invocation passed all three tests. The test runner
and discovery configuration were not changed to accommodate this baseline.

Lint passed with the existing anonymous-default-export warning in
`workers/public-pages/index.mjs`. All feature files pass Prettier. Whole-repo
`format:check` reports 15 existing files; each was compared to HEAD and confirmed
both unchanged and already unformatted on that baseline.

Local evidence:

```text
/tmp/pax-admin-summary-resume-{focused,typecheck,lint,build,formatcheck}.log
/tmp/pax-admin-summary-resume-all-tests.log
/tmp/pax-admin-summary-baseline-public-pages-vitest.log
/tmp/pax-admin-summary-baseline-public-pages-node.log
/tmp/pax-admin-summary-evidence-{focused,typecheck,lint,build,formatcheck}.log
```

## Real browser acceptance

The root agent verified the actual Console and same-origin proxy against the
paired Manager/PostgreSQL fixture, using synthetic records only:

- All 25 readable current summaries were reachable. The first raw candidate
  page produced 19 visible rows and the continuation added six; an inaccessible
  candidate consumed one position without leaking its content.
- Current v2 showed the beta content. Explicit v1 showed alpha, its exact
  revision and coverage hash in Raw JSON. Read evidence from v1 returned the
  frozen old alpha message even though the current message had been edited to
  beta.
- The 390 by 844 mobile viewport had no horizontal overflow: document
  `scrollWidth` was 390. Back to summaries worked.
- An observed server 403 removed cached list and detail data. Reloading with the
  ordinary viewer identity hid the admin navigation and denied direct URL
  access. Admin Preview as user unloaded protected content; the admin view was
  restored before closing the test tab.

Screenshots contain only the synthetic fixture:

```text
/private/tmp/pax-summary-admin-desktop.jpg
/private/tmp/pax-summary-admin-mobile.jpg
/private/tmp/pax-summary-admin-denied.jpg
```

The owned dev server on port 3127 was stopped before the final production build.

## Isolated development preview

Run Next directly to avoid refreshing a real Cloudflare token. For the root
agent's isolated Manager fixture, substitute its actual loopback port:

```bash
PATH=/Users/gengcongkai/.nvm/versions/node/v24.19.0/bin:$PATH \
NODE_OPTIONS=--no-experimental-webstorage \
PAX_MANAGER_URL=http://127.0.0.1:MANAGER_PORT \
PAX_CF_AUTHORIZATION=local-admin-summary-fixture \
PAX_BROWSER_REGIONS_ENABLED=false \
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax \
NEXT_PUBLIC_PAX_USER_SCOPE=self \
pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3127
```

Open `http://127.0.0.1:3127/admin/summaries`. The CF value above is only a
non-secret presence placeholder for the local proxy. The fixture browser must
still send its legitimate owner API key through a private mode-0600 header file;
Manager authentication remains authoritative. The root browser workflow owns
fixture credentials and cleanup. Do not copy those headers into source or logs.

This Console change does not publish a production frontend, generate summaries,
or modify Secretary settings or board state.
