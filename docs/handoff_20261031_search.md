# Workspace search handoff

## Checkouts

Console worktree: `/Users/gengcongkai/pax_workspace/work/search-mvp-console`
Branch: `codex/search-mvp-console`, based on `db7beea`.

Manager worktree: `/Users/gengcongkai/pax_workspace/work/search-mvp-manager`
Branch: `codex/search-mvp`, based on `0a96512`.

All feature changes are uncommitted in these isolated worktrees. The original
dirty Console and Manager checkouts were left untouched. No remote deployment
was performed.

## Implemented behavior

Every signed-in user can open Search from desktop or mobile navigation; desktop
also has a quick-search GET form. `/search?q=...&kind=...` supports title, message,
and current-summary results, filters, cursor pagination, restart, and safe literal
highlights. Same-query submission starts a fresh result set. Search is owner-only
and uses literal contiguous matching, including one Chinese character. It does
not call a model.

The source pane reads the precise hit ref through the same-origin proxy. It
supports first/last/full message views, bounded pages and context, session links,
and explicit current-version recovery after a version conflict. Summary coverage
and child-summary links keep their frozen source hashes/revisions. Errors hide
cached source bodies. Desktop uses a split pane after selection; mobile has a
source view with Back to results. Keyboard opening focuses the source heading;
Escape closes the pane.

Manager persists immutable summary versions, full coverage snapshots, and exact
summary-source links in PostgreSQL. A durable coalescing queue feeds its normal
Elasticsearch worker. Multipart text is ordered into one logical message and one
ES document; changing part boundaries does not change the full-body hash. Current
PG permission/deletion checks remain authoritative before returning search
snippets and source bodies. Secretary has a standalone search/read/expand/publish
MCP adapter. Search does not generate summaries or restart Secretary's stopped
experimental pipeline.

## Files

- `src/app/search/page.tsx`: authenticated search route and Suspense boundary.
- `src/features/api/workspace-search.ts`: typed search/read APIs, user-scoped
  TanStack Query keys, infinite paging, cursor restart, and retry policy.
- `src/components/search`: result rows, literal highlights, source reader, and
  behavior tests.
- `src/components/shell`: normal-user desktop/mobile entry and topbar GET form.
- `src/components/ui/search-box.tsx`: standard input/form props and default label.
- `scripts/search-smoke`: actual browser checks against isolated real services.
- `docs/agent-operating-guide.md`, `docs/architecture.zh.md`, and
  `docs/pax-console-design.md`: updated state, API, navigation and reader rules.

## Verification

Passed in the Console worktree:

```bash
pnpm typecheck
pnpm lint
pnpm build
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --maxWorkers 2
```

Full Vitest result: **75 files passed, 551 tests passed**, with one existing
skipped file/two skipped tests. The shell provides Node 26; its native webstorage
conflicts with Vitest/jsdom. The same failure was reproduced on unchanged HEAD
and resolved with the flag above, without modifying unrelated product code. The
project's pinned runtime remains Node 24. Relevant changed files also pass
Prettier and `git diff --check`.

The real browser runner passed all five scenarios using installed Google Chrome:

```bash
PAX_BROWSER_TEST_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/search-smoke/run.mjs
```

It observed successful actual Manager responses through `/api/pax`: Chinese
multipart and single-character search, unrelated phrase exclusion, owner
isolation, all result kinds, first/last/full views, bounded context, and exact
summary-coverage traversal. Desktop and 390x844 mobile screens had no horizontal
overflow or uncaught page errors. Screenshots were visually reviewed:

```text
/var/folders/0k/88mjprnd2b5cf2gprbpc8yj00000gn/T/pax-search-browser-aP4Iv2/
  desktop-message.png
  desktop-summary.png
  mobile-results.png
  mobile-message.png
```

The Manager full Go suite, lint/build, real PG/ES tests, full Docker integration,
actual HTTP/MCP acceptance, and all 17 Python tests also passed. New non-generated
Go code has **93.56% unit statement coverage**. See its
`docs/handoff_20261031_001801.md` and `docs/handoff_20261031_005809.md` for backend
commands, detailed evidence and operational limits.

## Local preview retained

At handoff, the local Console preview is `http://127.0.0.1:3117/search`.
It uses only seeded test data and the normal non-admin fixture identity
`local@example.local`. Manager runs at `http://127.0.0.1:55011` in Compose project
`pax-search-live-1793433318-99139`; PG and ES have no published host ports.
Console log: `/tmp/pax-search-console-preview.log`.

Try queries for the Chinese database substring, a single notebook character,
`visible paragraph`, or `Search decision`. These are fixture records, not an
import of the user's real history. The development preview uses the isolated
Manager's explicit local auth settings; production auth defaults are unchanged.

For a fresh run and complete startup instructions, see
`scripts/search-smoke/README.md`. From the Manager worktree, remove only the
retained fixture with:

```bash
./tools/search_live_stack.sh down pax-search-live-1793433318-99139
```

Close the local Next preview when finished. Production setup remains an operator
action, documented in Manager's `docs/search_deployment.md`, including persistent
receipt secrets, private ES networking and index rebuild steps. These fixture
checks establish behavior; they do not establish production capacity or latency.
