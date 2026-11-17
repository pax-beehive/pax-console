# Model gateway UI smoke

The fixture checks the actual Next route on desktop and mobile, alongside the
current Settings catalog and Runtime configuration entry. It covers explicit
budget saves, revision conflicts, pause-only user changes, model-base
preconditions, administrator Preview as user, denied reads, and ordinary users.
All browser APIs use fictional data; external requests are blocked. No account
credentials, provider request, paid generation, or cloud resource is used.

Build and start the Console with Node 24 (skip the local authentication helper):

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack
PAX_MANAGER_URL=http://127.0.0.1:9 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3136
PAX_GATEWAY_CONSOLE_URL=http://127.0.0.1:3136 node scripts/model-gateway-smoke/run.mjs
```

`PAX_BROWSER_TEST_EXECUTABLE` can select an installed Chromium, and
`PAX_GATEWAY_SMOKE_OUTPUT_DIR` selects the screenshot directory. By default a new
temporary directory is used. Run only against a loopback HTTP origin. Backend
persistence, authentication and accounting require the Manager/gateway tests.
