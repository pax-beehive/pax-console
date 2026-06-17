# PAX Console

PAX Console is a fleet control plane and real-time agent workbench.

The project baseline is documented in [docs/pax-console-design.md](docs/pax-console-design.md).

Architecture notes:

- Human-readable Chinese guide: [docs/architecture.zh.md](docs/architecture.zh.md)
- Agent operating guide: [docs/agent-operating-guide.md](docs/agent-operating-guide.md)

## Stack

```txt
Next.js App Router
TypeScript
Tailwind CSS + CSS variables
shadcn/ui + Radix UI
TanStack Query
Zustand
ahooks useRequest for local/action requests
```

The current UI layer uses local primitives in `src/components/ui` for buttons, search, tooltips, and truncated text. Radix is used underneath where it matters; full shadcn component generation can be added later without replacing the project architecture.

Volta pins the local runtime:

```txt
Node 24.14.1
pnpm 10.33.0
```

## Development

```bash
pnpm install
pnpm dev
```

For normal local testing with Cloudflare Access, open [https://console.paxtech.net](https://console.paxtech.net), which tunnels to `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` if you need to override defaults.

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://app.paxtech.net
```

Cloudflare Access owns browser authentication. The frontend should not store or manually pass `CF_Authorization`; browser REST requests use `credentials: "include"`, and browser WebSocket handshakes rely on same-domain cookies.

For local REST development against the protected backend, use the server-side dev proxy:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://app.paxtech.net
PAX_CF_AUTHORIZATION=<local-only Cloudflare Access cookie value>
```

Do not commit `.env.local`. The proxy keeps the Cloudflare cookie on the Next.js server side and returns a clear 401 when it is missing.

`next.config.ts` disables caching for `/_next/*` assets during tunnel-based development so browser/Cloudflare stale chunks do not hide UI changes.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
```
