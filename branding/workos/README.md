# PAX production AuthKit branding

`settings.json` identifies the production branding and controls the dark theme,
two-column desktop layout, mobile panel hiding, and existing legal links.
`panel.html` / `panel.css` contain the secondary panel; `authkit.css` styles the
hosted form using WorkOS `ak-*` classes. The panel follows the document language
for English/Chinese. Logos use the existing public PAX SVG.

Generate a non-secret `updateAppBranding` payload:

```sh
node scripts/workos-branding-payload.mjs
```

The script does not publish. Apply the payload through WorkOS with the explicit
production environment ID. Save the current branding before applying changes.
To revert, republish a previous verified payload or restore the saved branding
fields. These settings do not alter providers, sessions, verification or MFA.

Check the real hosted page after publication: desktop and mobile login, sign-up,
English and Chinese, logo loading, input focus, readable social buttons, and no
horizontal overflow. Secondary HTML cannot contain scripts or forms.

Docs: https://workos.com/docs/authkit/branding
