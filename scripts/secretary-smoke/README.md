# Secretary settings browser smoke

Run against a local Console connected to the isolated Manager fixture stack with
the new Secretary endpoints and a dedicated owned test agent. This test writes
fixture settings: it enables the selected agent, optionally requests a run, then
disables Secretary and restores the initial settings. The fixture must start
disabled. Use a test agent connected to the acceptance harness, or an offline
fixture agent; do not point the test at a live model agent.

```bash
PAX_SECRETARY_CONSOLE_URL=http://127.0.0.1:3117 \
PAX_SECRETARY_SMOKE_AGENT_ID=<fixture-agent-id> \
PAX_BROWSER_TEST_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/secretary-smoke/run.mjs
```

The default expected owner is `local@example.local`. Set
`PAX_SECRETARY_SMOKE_OWNER_EMAIL` for another isolated fixture owner. Output goes
to a private temporary directory unless `PAX_SECRETARY_SMOKE_OUTPUT_DIR` is set.
Only loopback HTTP Console origins are accepted.

The runner uses actual page actions and Manager HTTP responses, without request
mocks. It verifies normal-user access, explicit save, owned-agent selection,
enablement across reload, current runtime/manual-run eligibility, mobile Settings
navigation, persisted disablement, and desktop/mobile overflow. It saves three
screenshots plus a scrolled mobile controls view. Summary generation and immutable provenance are verified by the
Manager worker acceptance test, not by a successful settings PATCH.

It also reads real progress while disabled, compares global counts and each
loaded row against Manager data, checks exact turn/message fallback and canonical
session links, and verifies progress refresh preserves unsaved configuration.
Additional desktop/mobile progress screenshots show the paginated session list.
Use fixtures with completed, partial, and unstarted sessions to exercise every
classification without invoking a live agent.
