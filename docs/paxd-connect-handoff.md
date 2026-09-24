# paxd connect handoff

This note summarizes the frontend changes for the paxd interactive pairing entrypoint.

## User flow

```txt
paxd starts node registration
  -> pax-manager returns https://paxworkspace.net/connect.html?code=<PAIR_CODE>
  -> user opens the link and signs in through Cloudflare Access
  -> PAX Console shows the pairing page
  -> user reviews the pair code and node identity context
  -> user approves the registration
  -> paxd polling receives the issued node API key
```

The page assumes the user is already authenticated by the time the main pairing UI renders. Authentication still goes through the existing `AuthGate`; there is no dev-only auth bypass in the committed code.

## Files changed

```txt
next.config.ts
  Adds a rewrite from /connect.html to /connect so links returned by pax-manager resolve in the Next app.

src/app/connect/page.tsx
  Adds the App Router page and Suspense fallback for the connect entrypoint.

src/components/connect/paxd-connect-page-client.tsx
  Implements the authenticated pairing UI.

src/features/api/resources.ts
  Adds approveNodeRegistration(userId, pairCode).

src/features/api/types.ts
  Adds ApprovedNodeRegistration.
```

## Route behavior

The public link shape is:

```txt
/connect.html?code=ABC123
```

`next.config.ts` rewrites it internally to:

```txt
/connect?code=ABC123
```

This keeps the frontend compatible with pax-manager's verification URI while keeping the actual app route conventional.

paxl uses a separate device-login entrypoint:

```txt
/paxl-login.html?code=ABC123
```

`next.config.ts` rewrites it to `/paxl-login`, and the page calls the paxl
device-login approval API instead of the paxd node-registration API.

## API call

The approval action calls:

```txt
POST /api/v1/user/{user_id}/node-registrations/{pair_code}/approve
```

In browser code this goes through the existing same-origin proxy:

```ts
apiFetch(userPath(userId, `/node-registrations/${pairCode}/approve`), {
  method: "POST",
});
```

The page normalizes the input pair code to uppercase alphanumeric characters and requires exactly 6 characters before enabling approval.

## UI state

The connect page currently owns only local form state:

```txt
pairCode
approve mutation pending/success/error state
```

It does not add Zustand state or TanStack Query cache entries. The approval call is a one-shot mutation.

## Current node identity preview

The UI includes a compact `Node identity` section with fields for:

```txt
Host
Platform
Source IP
Approx. location
Cloud API
Requested
Approving as
```

Only `Approving as` is live today because it comes from the authenticated user object. The rest are placeholders until pax-manager exposes a pair-code preview endpoint.

Recommended backend shape:

```txt
GET /api/v1/user/{user_id}/node-registrations/{pair_code}
```

Suggested response fields:

```json
{
  "pair_code": "ABC123",
  "status": "pending",
  "expires_at": "2026-06-19T12:00:00Z",
  "request": {
    "hostname": "todds-mbp.local",
    "os": "darwin",
    "arch": "arm64",
    "machine_type": "MacBook Pro",
    "paxd_version": "0.1.0",
    "api_endpoint": "https://api.paxworkspace.net"
  },
  "network": {
    "ip_address": "203.0.113.10",
    "city": "San Francisco",
    "country": "United States"
  }
}
```

When that endpoint exists, wire it in `src/features/api/resources.ts` and pass the returned data into `NodePreviewPanel` in `paxd-connect-page-client.tsx`.

## Validation used

```txt
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

The production build passes. The remaining build warning is the pre-existing custom Cache-Control warning for `/_next/:path*`.
