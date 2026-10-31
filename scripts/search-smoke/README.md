# Workspace search browser smoke

This runner opens the real Console using installed Playwright. It uses the
isolated Manager/PostgreSQL/Elasticsearch fixture stack and the normal same-origin
`/api/pax` proxy. It does not mock requests, create business records, publish
summaries, or alter application authentication.

Use the repository Node version (24.14.1) and the already installed Console dependencies. From the sibling
Manager checkout, start a disposable stack and leave it running:

```bash
cd ../search-mvp-manager
./tools/search_live_stack.sh up pax-search-live-browser
```

The command prints the loopback Manager URL and seeds `local@example.local` as a
normal owner. Fixtures include multipart `数据库`, `苹果笔记本`, a message with
first/last paragraphs and surrounding context, and summary `search-live-summary`
v1 with a fixed source version. It also seeds another owner's hidden message.

Start this Console against the printed Manager URL in a separate terminal:

```bash
PAX_MANAGER_URL=http://127.0.0.1:MANAGER_PORT \
PAX_CF_AUTHORIZATION=local-smoke-fixture \
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax \
NEXT_PUBLIC_PAX_USER_SCOPE=self \
pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3117
```

`local-smoke-fixture` is a non-secret presence placeholder for the local proxy.
Current main forwards it as a Cloudflare assertion, so the isolated fixture also
needs a legitimate owner API key. Create that key through the local Manager
fixture API and save only `{ "Authorization": "Bearer <fixture-key>" }` to a
mode-0600 file outside the repository. Set `PAX_BROWSER_TEST_HEADERS_FILE` to its
path for the runner; the key takes precedence in Manager authentication. Do not
print or commit the file, and revoke the fixture key after testing. This does not
change application authentication. Running Next directly avoids refreshing a
real Cloudflare token for the isolated test.

Once the server is ready, run from this Console checkout:

```bash
PAX_BROWSER_TEST_HEADERS_FILE=/private/tmp/pax-secretary-pr-browser-headers.json \
node scripts/search-smoke/run.mjs
```

Optional environment variables:

| Variable                      | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `PAX_BROWSER_TEST_HEADERS_FILE` | Optional private mode-0600 JSON file containing only a fixture Authorization Bearer header; accepted only by this loopback runner |
| `PAX_SEARCH_CONSOLE_URL`      | Loopback Console origin; default `http://127.0.0.1:3117`                     |
| `PAX_BROWSER_TEST_EXECUTABLE` | Existing Chrome/Chromium executable, if Playwright's browser is unavailable  |
| `PAX_SEARCH_SMOKE_OUTPUT_DIR` | Screenshot directory; default is a newly created private temporary directory |

The runner verifies real successful POST responses and normal-user navigation;
literal Chinese and single-character matches; unrelated phrases returning no
results; session/message/summary filters; multipart source reads; paragraph
views and context; exact frozen summary source traversal; and desktop plus
390×844 mobile layout without horizontal overflow. Screenshots are written for
desktop message/summary and mobile results/message states. Success exits zero
and prints five `PASS` lines. Failures exit nonzero with a focused assertion.

The seed is intentionally small, so this browser run does not prove result
pagination or large-data latency. Server cursor behavior is covered by the API
hook tests and Manager acceptance tests. Keep this browser runner pointed at
the unchanged `up` fixtures; the Manager's destructive `test` scenario removes
its source as part of deletion validation.

Close the Console process and remove only this isolated stack when finished:

```bash
cd ../search-mvp-manager
./tools/search_live_stack.sh down pax-search-live-browser
```
