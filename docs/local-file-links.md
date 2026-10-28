# Local file links: copy path and fetch from the node

Agents often reference files on their own machine, for example
`[report.md](/Users/me/proj/out/report.md:12)`. The browser cannot open those
paths directly. The console shows them as `LocalFileLink`: the real path is
always visible and copyable, and inside a session the user can ask the node to
upload the file as a session artifact.

Code map:

```txt
src/features/local-files/local-file-href.ts        parseLocalFileHref / isLocalFileHref
src/features/local-files/remark-visualize-files.ts  complete visualize blocks become local-file links
src/features/local-files/local-file-link-context.ts LocalFileLinkContext
src/features/local-files/local-file-fetch-store.ts  session-local "already fetched" map (Zustand)
src/features/local-files/local-file-fetch-messages.ts denial / failure / HTTP error copy
src/components/ui/local-file-link.tsx               link text + copy button
src/components/local-files/local-file-fetch-provider.tsx  provider + fetch dialog
src/components/artifacts/publication-artifact-viewer.tsx  shared publication viewer
```

API (same-origin `/api/pax`, manager envelope `{code, message, data}`):

```txt
GET  /api/v1/user/{uid}/sessions/{sid}/artifact-fetches/check?path=<abs>
     data: {allowed, path, filename, size_bytes?, denial?: {code, rule, message}}
POST /api/v1/user/{uid}/sessions/{sid}/artifact-fetches   body {path}
     202 data: {accepted: true, publication: ArtifactPublication}
     200 data: {accepted: false, denial: {code, rule, message}}
     503 node offline, 409 E2EE session
```

## Feature: parse local file hrefs

```gherkin
Scenario Outline: href forms resolve to a clean absolute path
  Given a markdown href "<href>"
  When the console parses it as a local file href
  Then the path is "<path>" and the line is "<line>"

  Examples:
    | href                                   | path                       | line |
    | /Users/me/a.md                         | /Users/me/a.md             |      |
    | /Users/me/a.md:12                      | /Users/me/a.md             | 12   |
    | /Users/me/a.md:12:5                    | /Users/me/a.md             | 12   |
    | /Users/me/a.md#L12                     | /Users/me/a.md             | 12   |
    | /Users/me/a.md#L12-L20                 | /Users/me/a.md             | 12   |
    | file:///Users/me/a%20b.md              | /Users/me/a b.md           |      |
    | file://localhost/Users/me/a.md         | /Users/me/a.md             |      |
    | /Users/me/100%.md                      | /Users/me/100%.md          |      |
    | C:\Users\me\a.ts:3                     | C:\Users\me\a.ts           | 3    |
    | https://example.com/a.md               | (not local)                |      |
```

## Feature: copy the real path

```gherkin
Scenario: copy is always available
  Given a local file link is rendered anywhere (chat, artifact viewer, tool card, diff header)
  And the session may be E2EE, offline, or absent
  When I activate the "Copy path" button
  Then the clipboard contains only the absolute path, without "file://" or a line suffix
  And the icon shows a check for about 1.5 seconds

Scenario: clipboard API is missing
  Given navigator.clipboard is unavailable
  When I copy a path
  Then the console falls back to a hidden textarea and document.execCommand("copy")

Scenario: the real path is discoverable
  Given a markdown link whose text is "report.md"
  Then hovering the text shows the full path as the native tooltip
```

## Feature: fetch a local file from the node

```gherkin
Scenario: complete visualization reference
  Given an agent reply contains a standalone visualize block with a local path
  When the closing U+E201 marker arrives
  Then the block becomes a local-file link showing the filename
  And rendering it makes no network request
  When I click the filename
  Then the existing check and manual "Fetch and open" dialog is used
  And the optional mode field does not change the fetch flow

Scenario: unfinished or literal visualization reference
  Given a visualize block has not closed, or appears inside inline or fenced code
  Then the original text remains visible
  And it does not start a fetch

Scenario: no session context keeps the link inert
  Given a local file link without LocalFileLinkContext (for example the artifact viewer)
  When I click the link text
  Then nothing opens
  And the copy button still works

Scenario: E2EE or offline sessions keep the link inert
  Given the session is E2EE or its node is offline
  Then the link text uses the dotted inert style and its tooltip explains why
  And the copy button still works

Scenario: allowed fetch
  Given a non-E2EE session whose node is online
  When I click a local file link
  Then the console calls the check endpoint and shows a loading state
  When check returns allowed
  Then the dialog shows the full path in monospace, the size, and a cloud upload note
  When I choose "Fetch and open"
  Then the console POSTs {path} and shows "Preparing…" / "Uploading…" while the publication is queued or uploading
  When the publication becomes available
  Then the fetched file opens in the embedded artifact viewer
  And the session Artifacts panel is refreshed

Scenario: check denies the path
  When check returns allowed=false with code "owner_only_denied"
  Then the dialog shows friendly text including "chmod 644 <path>", the rule id, and the path
  And there is no fetch button, only "Copy path" and "Close"

Scenario: POST denies the path
  When the POST responds with accepted=false
  Then the dialog shows the denial view

Scenario: upload blocked by secret scanning
  When the publication fails with error_code "secret_detected"
  Then the dialog says a possible secret was found and the upload was blocked
  And offers "Copy path"

Scenario: reuse a fetched copy
  Given I fetched a path earlier in this session
  When I click the same path again
  Then the dialog offers "Open fetched copy (fetched HH:MM)" and "Fetch again"

Scenario: transport errors
  When check or POST fails with HTTP 503
  Then the dialog says "The agent's machine is offline"
  When it fails with HTTP 409
  Then the dialog says fetching is unavailable for end-to-end encrypted sessions
  When it fails with any other status
  Then the dialog shows a generic error
```
