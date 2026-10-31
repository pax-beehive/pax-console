# Workspace search browser smoke

This runner opens the real Console using installed Playwright. It uses the
isolated Manager/PostgreSQL/Elasticsearch fixture stack and the normal same-origin
`/api/pax` proxy. It does not mock requests, create business records, publish
summaries, or alter application authentication.

Use Node 24 and the already installed Console dependencies. From the sibling
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
PAX_CF_AUTHORIZATION=local-dev \
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax \
NEXT_PUBLIC_PAX_USER_SCOPE=self \
pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3117
```

`local-dev` is only an identity placeholder for this dev-auth fixture Manager;
do not use it against a Manager that validates Cloudflare JWTs. The server-side
proxy retains its normal identity gate. Running Next directly also avoids the
normal `pnpm dev` script refreshing a Cloudflare token for this isolated test.

Once the server is ready, run from this Console checkout:

```bash
node scripts/search-smoke/run.mjs
```

Optional environment variables:

| Variable                      | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
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
