# Model catalog import and pool status correction

Source baseline is the freshly verified live Console revision
`9a8efd041de1ad67481faa6b52b35a10c49b9300` (PR #293). The initial pool-only fix
is independently committed as `3aef0d6bb65d43727234341154a6e4930058be59`.
This follow-up adds model creation and OpenRouter catalog import on top.

A pool with a $100 limit, $0 spent/reserved and $100 remaining now reads Funded
(有余额), even while hosting is disabled. Zero budget and exhausted funds have
separate labels. Runtime readiness remains independent, with an explicit notice;
no limit, spend, reservation, enablement or model policy changes as a result of
this display correction.

Add model opens a searchable OpenRouter catalog. The browser only calls the
same-origin administrator-only BFF; it receives normalized public names/IDs,
context/output caps, and conservative integer accounting rates. Conditional-rate
upper bounds are marked. Every BFF read checks signed administrator identity with
Manager before accessing the public fixed endpoint or five-minute server cache.
The browser never receives provider keys or arbitrary upstream URLs. Failure and
empty states are explicit, with Retry and no invented model list.

Selection prefills upstream identity, price and output cap. An operator reviews
those fields plus the public alias and moderation policy, then explicitly creates
a disabled model. The existing hosting-admin PATCH carries `action: model_create`;
Manager assigns the policy version and persists it. Existing provider/model
identities are omitted from the picker. Secondary OpenAI/Anthropic manual entries
use the same strict identity/rate/output validation and trusted server profiles.

Duplicate identity 409 preserves an editable draft. If the refetched revision
advanced, Reload explicitly reviews it while retaining alias/selection/rates.
Stale revision 409 also requires Reload. No automatic write retries occur. Denied
catalog or manager access removes both model-admin and catalog queries and the
draft, including when Preview as user is enabled.

Validation:

- 140 focused tests passed across six UI/client/BFF files, covering exact-price
  import, server-refreshed disabled persistence, duplicate/stale conflicts,
  unavailable/empty catalog, unsafe input, auth/cache clearing, precision,
  normalization, cache/singleflight, body bounds and timeout behavior.
- Whole-source nonincremental TypeScript, ESLint and changed-file formatting pass.
- The actual local Next route passed the isolated Playwright import/management
  flow: 10 synthetic administrator reads, 2 catalog reads and 5 explicit synthetic
  writes; no unmocked API requests or browser JavaScript errors. Desktop/mobile
  artifacts are under `/tmp/pax-model-gateway-catalog-20261116`.
- The server normalizer was separately checked against the public catalog without
  provider credentials or generation calls: 470 raw entries, 446 compatible
  normalized entries, 111 conservative-rate entries on November 16, 2026.

Matching Manager source is `f8a53624d236c9cb977a7d0e7adc71a0a41e2a11`, based
on the independently verified live `5d53309`; it is not live at this handoff.
Deployment requires matching Manager `model_create` support and the trusted
provider-routing/catalog-adoption gateway changes before relying on model use.
A saved catalog entry is not proof that the provider is connected or generation
is ready. The initial service can remain disabled, without Lambda instances or
paid traffic. This source work does not alter real credit, create a real model,
activate a provider, merge a PR or deploy a service. The canonical release image
must be built from the final frozen commit through the existing release workflow.
