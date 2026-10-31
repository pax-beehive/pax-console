# Automatic Secretary settings

## Behavior

`/settings/secretary` is available to normal signed-in users, admins, and admin
preview mode. Choose one existing owned agent, edit Automatic summaries, and
explicitly Save settings. Opening the page and editing a draft do not enable
background work. An offline owned agent can be configured; work waits for its
connection. The page shows actual Manager status, pending conversations, last
completion, and a bounded safe error. Run now / Retry run requests work without
claiming it has completed.

Settings are persisted through GET/PATCH `/api/v1/user/{user}/secretary`;
manual runs use POST `/secretary/run` and accept successful HTTP/envelope 202.
PATCH sends only `agent_id`, `enabled`, and `expected_revision`. Manager derives
the authenticated owner and validates the selected agent. An empty agent ID can
clear the selection while disabled.

TanStack Query stores user-scoped settings/runtime data. Draft form state stays
local until saving. Runtime polling is five seconds enabled, fifteen disabled.
No optimistic enablement or run completion is displayed. Mutations cancel stale
GETs; failed or ambiguous writes refresh saved state and owned agents. Revision
conflicts refresh settings for review. The settings revision must remain stable
across runtime-only updates so polling does not discard unsaved drafts.

The desktop settings workspace and mobile Settings directory include Secretary. Missing agents, explicit foreign-owner entries, and failed inventory
reads cannot trap the user with enabled settings: disable can clear an unusable
selection. Browser code does not create agents, call models, or restart the
stopped local Secretary prototype.

## Files

Progress now shows authoritative total/up-to-date/partly-summarized/awaiting
session counts, exact committed coverage and remaining work. The thirty-second
progress query is independent of settings and works while disabled. Session rows
use exact turn counts only when grouping is complete; otherwise they use messages.
Reading by the model does not count as completion before publication. Counts
may rise after new messages/edits. Refresh replaces pages and preserves drafts.

- `src/features/api/secretary.ts`: typed HTTP functions, queries and mutations.
- `src/features/api/secretary-progress.ts`: read-only progress API and pagination.
- `src/components/secretary/secretary-progress.tsx`: global metrics, exact coverage,
  per-session source identities and remaining counts.
- `src/components/secretary/secretary-settings-page.tsx`: form, runtime status,
  explicit save and manual run.
- `src/app/settings/secretary/page.tsx`: authenticated route.
- `src/components/settings/settings-section-nav.tsx`: shared mobile settings
  navigation, also used by resource and project settings pages.
- `src/components/shell/sidebar.tsx`: normal-user desktop entry.
- `src/components/ui/switch.tsx`: shared accessible Radix switch.
- `scripts/secretary-smoke/run.mjs`: real HTTP browser acceptance runner.

## Verification

The 44 Secretary API/UI/navigation tests pass. They cover explicit save and disable,
offline/removed/non-owned agents, inventory failures with and without cached
rows, owner-isolated caches, server revisions, lost write responses, disabled
backend, runtime status, manual run eligibility and mobile navigation.
Progress includes 17 tests for authoritative totals, exact turn/message fallback,
changing remaining counts, no premature completion, pagination/replacement,
cursor restart, authentication, source links and draft preservation. Focused
progress/settings validation passes 30 tests.

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --maxWorkers=2 \
  src/features/api/secretary.test.tsx \
  src/components/secretary/secretary-settings-page.test.tsx \
  src/components/settings/settings-section-nav.test.tsx
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --maxWorkers=2 \
  src/features/api/secretary-progress.test.tsx \
  src/components/secretary/secretary-progress.test.tsx
pnpm lint
pnpm typecheck
pnpm build
```

Whole-repository lint, TypeScript, and the production build pass, including the
new static route. The build requires network access for the existing Google
font dependency; no font mocks or source substitutions were used. The final full
Console suite passes: 80 files and 595 tests passed, with one file / two tests
skipped by the existing suite.

Real Chrome browser verification passes against Console `127.0.0.1:3117` and
the new isolated Manager fixture `127.0.0.1:55014`, as the normal user
`local@example.local`. The dedicated owned `search-live-agent` fixture is offline:
enabling and reloading persist settings, status correctly waits for the agent,
and Run now stays disabled. Mobile Settings navigation, disabling across reload,
horizontal overflow and scrolling controls above the fixed bottom navigation all
pass. The runner confirms the original disabled configuration and agent selection
are restored. No actual user agent, model, or HTTP request mock is used.

Follow [`scripts/secretary-smoke/README.md`](../scripts/secretary-smoke/README.md)
to repeat. Inspected Secretary screenshots are under
`/private/tmp/pax-secretary-ui-20261031`: desktop enabled, mobile enabled, mobile
controls, and mobile disabled. The existing search real-browser regression also
passes against this new Manager: literal Chinese search, owner isolation,
first/last/full and context, exact summary coverage, and mobile source/back flows.
Its four screenshots are under
`/private/tmp/pax-search-secretary-regression-20261031`.

The updated progress browser run also passes against the refreshed fixture:
three tracked sessions, one up to date, one partly summarized and one awaiting
summary. It compares actual GET aggregates and rows with the UI, including a
completed `1 of 1 turn`, a partial `1 of 2 turns / 1 remaining`, and an ungrouped
session using `0 of 3 messages / 3 remaining`. The counts are available while
automation is disabled. Refresh preserves an unsaved agent/toggle draft; session
links, Queued-versus-coverage wording, mobile layout and scrollable bottom controls
pass. The runner asserts that the original OFF/empty-agent configuration is
restored. No HTTP mocks or actual agent invocation are used. These progress
fixtures use real receipt/publication data with explicitly synthetic committed
checkpoints; this browser run verifies display and wiring rather than model work.

Final progress screenshots, inspected on desktop and mobile, are under
`/private/tmp/pax-secretary-progress-ui-20261031`: `desktop-secretary-enabled.png`,
`desktop-secretary-progress.png`, `mobile-secretary-enabled.png`, and
`mobile-secretary-progress.png` (with additional controls/disabled captures).

The offline browser fixture intentionally does not invoke a model. Manager's
separate `make secretary-acceptance` passed 165 checks without skipped scenarios,
including actual HTTP/ACP execution, continuous worker polling, PostgreSQL
publication, immutable source binding, incremental edits and disabling. Its ACP
peer returns deterministic output; production model quality was not evaluated.
The complete backend handoff is in the adjacent Manager worktree at
`docs/handoff_20261031_095037.md`, covering the progress API and its published
coverage semantics; `docs/handoff_20261031_093837.md` remains the prior automation
handoff. Successful settings requests alone are not used
as evidence of generation.
