# Catalog reads through the existing WorkOS API path

This follow-up starts at current main
`cb79898be33613b3b85e38edb5e8b1dcd737700d`, which merged PR #295. It preserves
all catalog picker, disabled creation, accounting, conflict and pool-status UI.

The prototype Next BFF was outside the WorkOS region Worker's authenticated API
route. A legitimate administrator could therefore receive 401 even though the
ordinary Console API worked. The client now calls the existing `apiFetch` with
`/api/v1/user/self/hosting-admin/catalog?provider=openrouter`. Its configured base
(normally `/api/pax`), included credentials and standard Manager `JsonResponse`
envelope are reused automatically. The Worker owns session decryption and the
method/path/region-bound identity assertion; neither browser nor Console adds a
new cookie or identity-header mechanism.

The four unused Next BFF route/server-helper files and tests are removed. Manager
owns the public OpenRouter fetch, strict normalizer, conservative prices, bounded
body/timeouts and authenticated server cache. The DTO remains
`{source,fetched_at,models}` with exact integer accounting rates, bounded output
caps and optional `pricing_is_conservative`. Deploy the matching Manager catalog
GET route before this client. Provider keys remain outside the browser.

Transport tests exercise the real shared API client with default/custom API
bases, included credentials, a wrapped response, 401/403, 503 without replay,
empty/malformed DTOs, cancellation and the deadline through JSON consumption.
The browser fixture now intercepts only the authenticated Manager catalog path
and returns its wrapped envelope; any obsolete BFF request fails the fixture.
Local browser fixtures prove rendering and client routing, while Manager/Worker
checks establish production identity authorization.

Validation completed locally with Node 24:

- 88 tests passed across five UI/API/transport files.
- Whole-source nonincremental TypeScript, source ESLint and changed-file formatting
  passed; the picker/creation/pool UI and core auth/proxy modules are unchanged.
- The actual local Next/Chromium fixture passed with only the authenticated catalog
  path and Manager envelope mocked: 10 synthetic admin reads, 2 catalog reads,
  5 explicit synthetic writes, no unmocked API requests or JavaScript errors.
- Browser artifacts are under `/tmp/pax-model-catalog-workos-routing-20261116`.

This follow-up does not revert main or PR #295, change login/region routing,
activate models/providers, alter credit, deploy infrastructure or call paid
models. Root coordinates the matching Manager PR, CI images and release flow.
