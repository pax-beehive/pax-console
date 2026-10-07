# Public product overview and search indexing

`https://paxworkspace.net/overview` is the English product introduction;
`https://paxworkspace.net/zh/overview` is its Simplified Chinese counterpart.
The root remains the existing workbench. No domain, cookie, or browser key
migration is required. Both pages use PaxWorkspace as the searchable brand and PAX as its short name.
They share server-rendered components and a typed translation dictionary; a
visible English / 中文 switch links between them without automatic redirects.
The Chinese page notes that the workspace currently uses English.

The overview architecture figure shows a browser connected through PAX cloud
to multiple user-owned Agent hosts. E2EE is explicitly optional and describes
the browser-to-host boundary; it does not imply encryption from the browser
through to third-party model providers. The figure is accessible inline SVG,
with readable text and no image or account request dependency.

## Application behavior

- Only the exact `/overview` and `/zh/overview` pathnames bypasses AppProviders' RegionGate. It
  contains no account components or API requests. Its Server Component body
  is present in the initial HTML, including when JavaScript is disabled.
- Entering `/` from the overview mounts RegionGate and then the existing
  AuthGate. Other routes and API authorization are unchanged.
- The root layout defaults to `noindex, follow`; `/overview` overrides this
  with `index, follow`, a self-canonical, localized title, description, Open Graph
  and Twitter card metadata. These crawler directives are not access controls.
- Static `/robots.txt` permits page and asset crawling, excludes `/api/`, and
  links `/sitemap.xml`. The sitemap lists both canonical overview URLs. Both pages declare reciprocal
  `en` and `zh-CN` hreflang links, with English as `x-default`.
- The overview includes descriptive WebPage/SoftwareApplication JSON-LD,
  without fabricated ratings, prices, or rich-result guarantees.
- `public/paxworkspace-social.png` is the 1200 × 630 share image. Its editable
  source is `public/paxworkspace-social.svg`; keep the two in sync.

## Cloudflare Access and release

The English overview and its static assets already have public Access paths.
The bilingual release additionally needs the exact `/zh/overview` path. An
application change alone cannot make a new route crawlable.
After deploying the Console image, configure path-specific public access for:

```text
/overview
/zh/overview
/robots.txt
/sitemap.xml
/paxworkspace-social.png
/pax-app-icon.png
/favicon.ico
/manifest.webmanifest
/_next/static/*
```

Normalize trailing slashes on both overview paths to their canonical paths (Next's default trailing-slash redirect)
and ensure that request can reach the redirect without an Access login.
Static bundles and icons contain public client assets, not session data.
Do not bypass the whole hostname, `/api/*`, `/_next/*`, session pages, artifact
routes, or device pairing routes. Check Cloudflare path-policy precedence
against the existing hostname-wide Access application before changing it.
Public access is for everyone, not a crawler-only exception.

Verify without cookies after rollout:

1. Both overview paths respond 200 with the headline in actual HTML, not only in a
   serialized React payload or an account-loading screen. Repeat with a
   Googlebot user agent and with JavaScript disabled in a browser.
2. The title, description, index directive, canonical, JSON-LD and image URL
   are correct. CSS/fonts/icons and the PNG load without authentication.
3. `/robots.txt` and `/sitemap.xml` return 200 and their expected text/XML.
4. `/` still follows the account login and region flow. Account APIs and
   private artifacts still require their existing authorization.
5. On desktop and mobile there is no horizontal overflow in either language.
   Language links, workbench links, and FAQ disclosures work.

## Search Console

Verify the `paxworkspace.net` domain property using the Google-provided DNS
TXT record, if it is not already verified. Submit
`https://paxworkspace.net/sitemap.xml`, inspect both live overview URLs, and
request indexing once the unauthenticated checks above pass. The actual TXT
value must come from the owner's Search Console account; do not invent it.

Use `PaxWorkspace` consistently in public profiles and product posts, and link
to `/overview` for English-speaking visitors or `/zh/overview` for Chinese
readers (including Xiaohongshu posts). Track the `paxworkspace` search query
and indexed-page status in Search Console. No Google Ads purchase is required;
publishing a sitemap or requesting indexing does not guarantee inclusion or
ranking.

## Local validation

Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and
`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run
src/components/providers/app-providers.test.tsx
src/features/region/region-gate.test.tsx src/components/ui/button.test.tsx`.
The provider tests cover no-JavaScript server output, account-gated routes,
and navigation from the public page into the workbench.

Against a running production preview, run
`node scripts/check-public-overview.mjs http://127.0.0.1:3017 /tmp/pax-overview`.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an installed Chrome instead
of Playwright's bundled Chromium. This checks the actual HTML metadata, PNG,
robots/sitemap responses, hydrated desktop/mobile layout, FAQ interactions,
absence of public-page account requests, and navigation back into the login
flow with mocked account endpoints. The optional final argument saves screenshots.
These local checks do not verify production Cloudflare policies or indexing.

References: [Google technical requirements](https://developers.google.com/search/docs/essentials/technical),
[sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
