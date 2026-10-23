# Public company and policy pages

This small, independent Worker serves `/about`, `/privacy`, and `/terms` on
`paxworkspace.net`. `/about` is the public OAuth application homepage and links
to the existing detailed `/overview` and `/zh/overview` product pages. It includes
the policy links required for the OAuth homepage. Content is in `content.mjs`.

The pages are static HTML with inline CSS, no client JavaScript, cookies,
account requests, databases, or secrets. They do not use the Next.js account
or regional gate. This lets the legal pages remain readable while the Console
still uses its existing authenticated container deployment.

The Cloudflare routes are deliberately limited to three prefixes. The handler
accepts only the exact document paths and a single trailing slash, rejects all
other paths with 404, accepts GET/HEAD only, and never forwards requests to an
origin. Root, `/api/*`, the regional Worker, and existing Access policies are
not part of this deployment. Do not broaden routes to the whole hostname.

Cloudflare Access must also permit these documents before the Worker can run.
The production application `PAX Public Company and Policies`
(`c169afad-b909-4dce-b4a7-ef549c9e2925`) contains only the three exact destinations
`paxworkspace.net/about`, `paxworkspace.net/privacy`, and `paxworkspace.net/terms`.
It reuses `PAX Public Assets Bypass`
(`41b1b194-a894-46d7-806d-1e3ed37131af`, everyone/bypass), without changing that
policy or the broader authenticated PAX application. Access path matching can
include descendants; the Worker's exact-path check remains necessary. A more
specific application does not inherit the broader application's policies.
Remove this dedicated Access application as well as the Worker routes if
retiring the public surface, so future origin routes do not inherit a bypass.

## Validate and deploy

From this directory, using the authenticated Cloudflare account:

```sh
node --test index.test.mjs
npx wrangler@4.127.1 deploy --dry-run --outdir /tmp/pax-public-pages-dry-run
npx wrangler@4.127.1 deploy
```

Verify anonymously after deployment: all three pages return HTML 200; links
work without cookies or JavaScript; desktop/mobile pages do not overflow;
trailing slashes redirect; unknown sibling paths return 404; root and account
APIs still require their existing authentication. Also compare current zone
routes to ensure the regional Worker routes remain unchanged.

The Worker is independent of the repository's Console-image publishing
workflow. A new Console image does not deploy these documents. Record the
exact Worker version and Git revision for each publication. Roll back using
the preceding Worker version, or remove only this Worker's three routes to
restore the previous origin routing. Never remove the regional Worker routes.

The company name and postal address were supplied by the owner. Publication
does not establish Google brand approval, domain verification, or successful
application login. Those require separate live checks.
