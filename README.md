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

For normal local development, open [http://localhost:3000](http://localhost:3000).
`pnpm dev` uses `cloudflared access` to write a local-only
`PAX_CF_AUTHORIZATION` token into `.env.local`, so browser REST requests can use
the same-origin `/api/pax` proxy without a Cloudflare Tunnel.

You can also run `pnpm auth:local` directly to refresh the token without
starting the dev server. Set `PAX_SKIP_AUTH_LOCAL=1` to start Next.js without
refreshing local auth.

### Cloudflare Tunnel Mode

Use Cloudflare Tunnel only when validating the real Cloudflare Access entrypoint,
cookie forwarding, or browser WebSocket behavior:

```txt
Browser
  -> https://paxworkspace.net
  -> Cloudflare Tunnel
  -> http://localhost:3000
```

Do not share one tunnel hostname across multiple active local machines unless
you deliberately want Cloudflare to route that hostname to whichever connector is
currently active.

## Environment

Copy `.env.example` to `.env.local` if you need to override defaults.

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.paxworkspace.net
```

The hosted Console is `https://paxworkspace.net`. Browser REST stays on its
same-origin `/api/pax` proxy, whose upstream defaults to
`https://api.paxworkspace.net`; direct agent tunnels default to
`wss://api.paxworkspace.net`. Set `NEXT_PUBLIC_PAX_WS_BASE_URL` only when a local or
alternate manager needs a different tunnel origin.

Cloudflare Access owns browser authentication. The frontend must not store or
manually pass `CF_Authorization`. Browser WebSocket handshakes rely on the
Access session valid for the API hostname.

When opening the dev server from another machine, set
`PAX_ALLOWED_DEV_ORIGINS` to the comma-separated LAN hostnames or IPs that may
load Next.js development assets, for example `192.168.0.174`.

For local REST development against the protected backend, use the server-side dev proxy:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.paxworkspace.net
PAX_CF_AUTHORIZATION=<local-only Cloudflare Access cookie value>
```

Run `pnpm auth:local` to refresh `PAX_CF_AUTHORIZATION` manually. Do not commit
`.env.local`. The proxy keeps the Cloudflare token on the Next.js server side
and returns a clear 401 when it is missing.

`auth:local` resolves its Access application URL from `PAX_ACCESS_APP_URL`, then
`PAX_MANAGER_URL`, then `https://api.paxworkspace.net`. It writes that computed URL
back as `PAX_MANAGER_URL`; an explicit local or alternate upstream is not
replaced with the hosted default.

### Local PAX Manager Mode

To point the console at a local `pax-manager`, keep browser requests on the
same-origin proxy and change only the proxy upstream:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=http://localhost:19879
PAX_CF_AUTHORIZATION=local-dev
```

Replace `19879` with the local manager port. Start the console with:

```bash
PAX_SKIP_AUTH_LOCAL=1 pnpm dev
```

`PAX_SKIP_AUTH_LOCAL=1` only skips the Cloudflare token refresh script; it does
not provide an identity by itself. Keep `PAX_CF_AUTHORIZATION` set so the
Next.js `/api/pax` proxy accepts the request. If the local manager validates
Cloudflare JWTs, use a real token instead of `local-dev`; if the local manager
runs with dev auth bypassed, the placeholder value is enough.

`next.config.ts` disables caching for `/_next/*` assets during tunnel-based development so browser/Cloudflare stale chunks do not hide UI changes.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
```
