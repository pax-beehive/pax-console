# Agent Operating Guide

This file is for coding agents working on PAX Console. Keep it short, factual, and current. When architecture or integration behavior changes, update this file together with `docs/architecture.zh.md`.

## Mobile layout

ConsoleLayout owns visual viewport sizing through `useConsoleViewport` at all
screen widths, including iPad hardware-keyboard accessory bars. Update shell
height/offset CSS variables in one animation frame, without React state updates
or per-composer keyboard padding/scrollIntoView. Lock document scrolling only
while the console is mounted; keep scrollable work areas inside the shell and
mark chat/context scroll roots with `data-viewport-scroll` to preserve reading
position or bottom anchoring. Mobile navigation is positioned inside the shell.
Do not resize the shell during pinch zoom or disable user zoom. WebKit touch
form controls use at least 16px even at tablet/desktop breakpoints.

`SessionDraftInput` alone subscribes to draft text on every keystroke. Session
controls subscribe only to whether the draft is nonempty; submission, queue,
and steer handlers read the current Zustand draft synchronously. Home's new
message draft uses the user-scoped `home:{user_id}` key in the same in-memory
store. Never debounce draft writes or subscribe Home/the timeline to raw draft
text. Completion scrolls its own list and focuses the input with preventScroll.

Existing sessions expose secure secret delivery in the composer + menu, including
E2EE sessions where uploads remain disabled. Reuse NodeSecretChannelPush and the
node-level channel API; never store plaintext in chat drafts or query caches.
Only a successful file receipt is appended to the originating draft (preserving
existing text); the user reviews/sends it. Keep the node-detail entry available.

Session headers keep the title, Project / Agent, and immutable workspace visible.
Rename and runtime reset live in Session actions. One panel-right button opens
Artifacts / Browser / Knowledge (admin-only); tool evidence is a contextual tab.
Mobile resources use a bottom sheet; desktop keeps a right panel. Home's left
hamburger opens recent sessions, not a duplicate horizontal tab strip.
SessionSettings provides one modal surface for both new and existing sessions:
mobile bottom sheet, desktop centered dialog. Its local context owns only page
navigation, while configuration values and permission mutations keep their
existing owners. Use the shared SettingsRow / SettingsChoice / SettingsToggle
primitives. Model, reasoning, and permission choices replace the panel content;
do not nest a dropdown or native select. Broad permission confirmation also
stays inside this panel and must complete before committing. Back/Cancel never
commit, selection returns home, and closing restores trigger focus. Page
changes focus the heading and reset internal scrolling; reopening starts fresh.
Creation-only controls are wrapped in SessionSettingsHome so they do not leak
onto option or confirmation pages.
E2EE activation displays a readable, non-interactive notice for 2.4 seconds;
the persistent Encrypted state lives in the settings summary and switch. Do not
leave a floating status or click tooltip over the workspace. Home agent choices
use a portaled popover anchored below the trigger with viewport collision handling,
so the composer clipping boundary cannot hide them. Changing agents preserves
the encrypted creation intent.
Image/browser preview close controls use an accessible label without a tooltip.
A tooltip on a dialog's initially focused close button can remain open over
the content; preserve autofocus and keyboard dismissal without that bubble.
MessageAttachment receives its message's attachment list as a gallery. Navigate
only resolvable raster images in attachment order, skip non-images, disable
boundary arrows, and hide navigation for one image. Buttons and Left/Right
keys update the title and position counter. Preview errors/retries belong to
the current image independently of the message thumbnail; render only the
selected image through the existing authenticated attachment endpoint.


The turn-footer gauge represents context used/window (not per-turn tokens).
Its needle and colored arc share a clamped continuous ratio and green-to-red
hue; absent/invalid capacity is neutral and does not imply zero usage.

Mobile layout: keep Queue/Stop directly accessible; Steer is available in the
mobile turn overflow menu and as a desktop shortcut. Bound the permission
trigger width without shortening its accessible name or menu labels. Do not
show the unavailable voice action on mobile. Project selects use a visible
custom chevron and dark surface while retaining native selection. RunBadge
icon/text must share a no-wrap inline flex container. The mobile topbar has a
44px minimum height plus safe-area padding; reload lives in the user menu.
Inline code may move as a unit, but long tokens must still wrap within the viewport.

## Encrypted transport boundary

Home checks the selected agent's browser root-key availability before enabling
E2EE. Missing or unreadable keys show an agent-scoped Pair E2EE link; pending
checks cannot enable encryption. Agent changes preserve encrypted intent but
block submission until the selected agent has a key, without plaintext fallback.
Recheck local availability when the window regains focus after pairing. Store
only readiness in React state; the runtime still validates keys at creation.

The Browser-to-paxd E2EE implementation lives in `src/features/e2ee`.
Keep envelope construction, HKDF/AES-GCM, SSE parsing, and IndexedDB key access
out of React components. The Manager must receive only the serialized encrypted
envelope; never add a root key, plaintext ACP method/params, prompt, tool output,
or native request ID to an HTTP request or log.

The v1 envelope compatibility contract is covered by
`src/features/e2ee/envelope.test.ts` and the matching paxd Go test vector.
Changing the HKDF info, AAD order, JSON normalization, nonce encoding, or
envelope field names requires changing both implementations and their shared
vector in the same rollout.

`src/features/e2ee/transport.ts` owns the encrypted command POST and encrypted
event SSE. Preserve `Last-Event-ID`; advance the cursor only after every frame in
the decrypted batch has been accepted by the caller. For an ambiguous command
POST failure, retain the value returned by `prepareEncryptedCommand` and call
`postEncryptedCommand` again with that exact envelope; re-encrypting the same
business command would change its nonce/ciphertext and correctly conflict at the
Manager. `root-key-store.ts` stores
one development root key per agent in IndexedDB, surfaced under Settings / Advanced settings /
Encrypted chats. Root keys must not be put in TanStack Query, localStorage, server
components, URL state, or the Manager API.

Encrypted ACP event plaintext carries the paxd-projected `turn_id` beside its
`frames`. The Console must attach that ID to every normalized live event and
replace the locally optimistic `pending-turn:*` ID with it. Canonical encrypted
history uses the same turn ID, allowing the shared timeline reconciler to hand
an active turn from live events to durable history without rendering both.

Manager session resources expose `transport: "manager" | "e2ee"`. The first
encrypted command durably marks that session as `e2ee`; Manager startup also
backfills the marker from existing encrypted commands, events, or canonical
history. Home shows encrypted sessions in the normal session rail with an
`Encrypted` badge. The shared Session workbench selects encrypted history,
event SSE, prompt, and cancel transport only from this server-owned marker.
Never switch a workbench merely because a local root key exists: one agent can
own both plaintext and encrypted sessions. Missing browser key material leaves
an E2EE session visibly locked and must not fall back to `/conversation`.

Home's new-session composer exposes an `Encrypted` toggle. The selection is
passed to the shared workbench as creation intent, not inferred from key
presence. Encrypted creation must check the browser key before creating a
Manager session, create that session, send encrypted `session/new`, wait for its
ACP response, and only then publish the assigned session to Home and send the
initial encrypted prompt. Do not save a Project Target before `session/new`
succeeds. The normal toggle-off path must remain on `/conversation`.

The E2EE workbench currently supports durable history, live frames, prompt, and
cancel. Queue, steer, attachments, and Manager-projected permission decisions
remain disabled on encrypted turns until their payloads have encrypted ACP
equivalents. `/e2ee` remains a diagnostic lab rather than the product entry.

## Non-Negotiable Project Facts

- Project root: `/Users/jiahangzhang/code-base/project/pax-console`
- Human architecture doc: `docs/architecture.zh.md`
- Canonical design doc: `docs/pax-console-design.md`
- API reference snapshot: `docs/api.json`
- Local browser hostname: `https://paxworkspace.net`
- PAX Manager upstream: `https://api.paxworkspace.net`
- Browser WebSocket upstream: `wss://api.paxworkspace.net`
- Default browser API base: `/api/pax`
- Do not make browser REST calls directly to `https://api.paxworkspace.net` unless the user explicitly asks to debug CORS.

## Required Mental Model

```txt
Browser
  -> paxworkspace.net
  -> Next.js app
  -> /api/pax/* same-origin proxy
  -> api.paxworkspace.net

Browser agent tunnel
  -> wss://api.paxworkspace.net/api/v1/user/self/agents/{agent_id}/tunnel
```

Cloudflare Access and CORS complexity should be isolated in the Next route handler:

```txt
src/app/api/pax/[...path]/route.ts
```

Do not spread Cloudflare cookie handling into React components.

Home has one recent-session rail, grouped by date, with Project filtering and
Project / Agent context per row. Pass the selected `primary_project_id` into both
the paginated session request and its Query key; never filter only loaded pages.
All projects includes unassigned sessions. Agent, Node and archive filters still
apply. Keep scroll pagination and a Load more sessions button for short lists.
Changing the Project filter preserves the open workbench instance and does not
change creation context. Identity/workspace headers share 20px mobile and 24px
desktop horizontal padding; rail text uses 24px left padding.
Projects are logical, owner-scoped, nestable
work groups. Targets bind an Agent to a directory intent. Creation has two
header rows: Project / Agent, then Workspace. Resolve only enabled targets for
that pair: default, then sole match; otherwise require a choice. The workspace
picker separates Saved workspaces and Enter a path. Manual input only commits
on Use this path. Save as workspace target is unchecked by default; persist a
new target only when opted in and native session assignment succeeds. Reuse a
matching enabled target. Scope both path and save intent to Project / Agent;
never implicitly switch agents. Wait for targets to load before project creation.
The Session's optional
`primary_project_id` is immutable. Do not overload that singular field for
future multi-Project labels; use a separate association model.

## Local Development

Expected local env:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.paxworkspace.net
PAX_CF_AUTHORIZATION=<generated by pnpm auth:local>
```

The hosted direct-tunnel default is `wss://api.paxworkspace.net`. During the
cross-account migration, a browser loaded from `ws.lakeward.net` keeps the
legacy `wss://api.lakeward.net` endpoint. Preserve
`NEXT_PUBLIC_PAX_WS_BASE_URL` as the explicit build-time override for a local
or alternate WebSocket origin. `pnpm auth:local` resolves its application URL
from
`PAX_ACCESS_APP_URL`, then `PAX_MANAGER_URL`, then the hosted API default, and
writes that computed URL back to `.env.local` as `PAX_MANAGER_URL`.

The production same-origin REST proxy may use
`PAX_MANAGER_URL=http://pax-manager:9879` on the private Docker network. It
must continue forwarding the inbound `Cf-Access-Jwt-Assertion` so Manager can
validate the matching old or migration Access account without crossing the
other account's public Access boundary.

Optional: `NEXT_PUBLIC_PAX_LOGOUT_URL` overrides the topbar "Sign out"
target. It defaults to `/cdn-cgi/access/logout`, Cloudflare Access's
same-origin logout endpoint. Sign out navigates the browser straight to
that URL (see `LOGOUT_URL` in `src/features/api/client.ts`); it does not
go through the `/api/pax` proxy.

`next.config.ts` must keep:

```ts
allowedDevOrigins: ["paxworkspace.net", "*.console-dev.paxworkspace.net"];
```

Additional LAN origins may be supplied at dev startup through the
comma-separated `PAX_ALLOWED_DEV_ORIGINS` environment variable. Do not hardcode
developer-machine IP addresses in `next.config.ts`.

It also sets `Cache-Control: no-store, max-age=0` for `/_next/:path*`. Keep this while developing through `paxworkspace.net`; otherwise Cloudflare/browser caching can serve stale Turbopack chunks after UI layout changes.

Use `pnpm dev` for local development. It first runs the local Cloudflare Access
token sync and writes `PAX_CF_AUTHORIZATION` into `.env.local`, then starts
Next.js. Normal development should open:

```txt
http://localhost:3000
```

If the app is accessed through Cloudflare Tunnel, open:

```txt
https://paxworkspace.net
```

Tunnel mode is for validating the real Cloudflare Access entrypoint, cookie
forwarding, and browser WebSocket behavior.

For team development, prefer localhost plus automatic `pnpm dev` auth sync over
one Cloudflare Tunnel per developer. Use `PAX_SKIP_AUTH_LOCAL=1 pnpm dev` only
when intentionally debugging without token refresh.

To test against a local `pax-manager`, point the server-side proxy upstream at
the local port and keep browser API calls on `/api/pax`:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=http://localhost:19879
PAX_CF_AUTHORIZATION=local-dev
```

Then start:

```bash
PAX_SKIP_AUTH_LOCAL=1 pnpm dev
```

`PAX_SKIP_AUTH_LOCAL=1` only prevents `scripts/sync-cloudflare-access-token.mjs`
from overwriting `.env.local`; it does not satisfy the proxy identity check.
Keep `PAX_CF_AUTHORIZATION` set. Use a real Cloudflare token if the local
manager validates JWTs; `local-dev` is only for local manager configurations
with dev auth bypassed.

## Cloud Run Deployment

Production is expected to run as a Dockerized Next.js service on Cloud Run,
usually created with Cloud Run "Connect repository" against the GitHub repo.
The root `Dockerfile` builds `next.config.ts` with `output: "standalone"` and
runs the generated `.next/standalone/server.js` on `PORT=8080`.

Expected Cloud Run env:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.paxworkspace.net
```

Do not set `PAX_CF_AUTHORIZATION` as a production fixed secret. Production
should receive the user's Cloudflare Access identity at `paxworkspace.net` and
forward it through the same-origin `/api/pax` proxy.
Direct browser agent tunnels connect to `wss://api.paxworkspace.net` and require a
Cloudflare Access session valid for that API hostname.

## State Ownership

Icon-only toggles use the shared `Button` tooltip. Enable `tooltipOnClick` when
the explanation must also appear after a touch/click; keep the toggle's state
available through `aria-pressed` and its action through `aria-label`.

TanStack Query owns server data:

```txt
current user
nodes
agents
sessions
messages
mailbox history
teams
team members/invites/agents
friends
envelopes
knowledge capsules/injections
metrics
pagination
cache/refetch/invalidation
```

Zustand owns client-only UI state:

```txt
active ids
sidebar state
drawer state
composer drafts
local filters
temporary UI selections
admin preview-as-user mode
```

The mobile Home workbench also keeps a user-scoped open-session workset in
`localStorage`. Persist only the ordered `session_id` list; session names, run
state, and ownership continue to come from the TanStack Query session list.
Closing a top tab is UI-only: it must not archive or delete the durable session,
stop a turn, or cancel the agent. Only the active tab mounts
`SessionWorkbench`.

Admin-only experimental UI must use the shared effective admin view. A real
admin can enable `Preview as user` from the top-right user menu; while enabled,
the UI must hide the same experimental controls hidden from normal users.
Knowledge panels, fake inquiries, global search, image attachment, and voice
input currently follow this rule. Tool evidence and the read-only Session
Artifacts panel remain available to all session users. The Artifacts panel
supports list, refresh, signed preview, and download; it does not expose the
legacy browser upload control.
The Collaboration navigation group is also admin-only for the current public
release. Both desktop and mobile navigation must honor preview-as-user mode.

Never duplicate server resources such as nodes, agents, sessions, messages,
teams, friends, envelopes, or knowledge capsules into Zustand.

## REST API Rules

Use:

```ts
apiFetch(userPath(userId, "/..."));
```

from:

```txt
src/features/api/client.ts
src/features/api/resources.ts
```

Do not add `Content-Type: application/json` to GET requests. It can trigger unwanted CORS preflights if the base URL is ever remote.

Keep resource hooks thin. Components should compose hooks rather than build URLs manually.

Session history uses the session-scoped endpoint:

```txt
GET /api/v1/user/{user_id}/sessions/{session_id}/history
```

PAX Manager resolves and authorizes the owning agent from the durable session.
The legacy agent-scoped history endpoint remains backend-compatible, but new
Console reads must not derive history ownership from the currently selected
agent.

The paxd control tunnel supports one outstanding query request/response per
node. UI reads for daemon status, harnesses, and connections must be sequenced;
do not launch them with `Promise.all`. Commands are
asynchronous: mutation responses acknowledge receipt, then the UI polls the
agent connection inventory until the requested generation, restart nonce, and
runtime phase have converged. The command ACK is not the runtime completion
signal.

Agent detail also mounts `NodeDaemonControl`, scoped by exact `cloud_agent_id`.
Its Edit settings action exposes the shared Slots/runtime form; discovery,
creation, and harness inventory remain node-only. Never infer a connection from
its name or pick the first connection when an agent has no matching binding.
Both entry points use the same node query cache and command reconciliation.

Collaboration and knowledge resources are normal user-scoped REST resources:

```txt
/teams and /team-invites
  Team membership, invites, and team agent grants. Invite UI must explicitly
  send member/operator; do not rely on the backend default role.

/friends
  Accepted friend relationships gate envelope delivery.

/envelopes
  Mailbox-like cross-user delivery for knowledge capsule payloads.

/knowledge-capsules and /sessions/{session_id}/knowledge-injections
  Reusable session knowledge and system_handoff delivery into sessions.

/attachments
  User prompt attachments are input-only. Browser code creates an attachment,
  dispatches the returned upload ticket by `upload.protocol`, completes it
  through the manager, and only then references the returned `attachment_id`
  inside `/conversation` content blocks. `s3_presigned_put` sends one direct
  PUT with the exact ticket headers. A 412 from that write-once PUT is an
  ambiguous stored success, so the browser continues to manager completion;
  the manager's HEAD validation remains authoritative. Other non-2xx responses
  fail. `gcs_resumable` retains the legacy initialize-then-PUT handshake.
  Unknown protocols must fail before uploading. Attachments are not agent-bound.
  Home and session composers share ComposerDropZone for multi-file drops into
  the input surface; keep the file-picker path as well. Only file drags prevent
  browser defaults, with nested drag feedback cleared on leave/cancel/drop.
  Reuse the same upload pipeline and an in-flight guard. Encrypted sessions
  reject file drops and picker uploads; encryption cannot be enabled mid-upload.
  ComposerAttachmentStatus uses neutral upload/waiting feedback, and a compact
  dismissible error with technical details collapsed. Do not style ordinary
  upload progress or waiting for the current turn as a warning.

/artifact-publications/{publication_id} and
/artifact-publications/{publication_id}/content/main
  Agent publish_artifact output is output-only. The browser never creates these
  uploads. The session timeline detects `message_type = "pax:artifact"`, polls
  publication state until `available` or `failed`, and uses the publication
  content endpoint for preview/download URLs. Treat publication ids as the UI
  card key; do not manage lifecycle by artifact id.

/artifact-uploads, /artifacts, and /sessions/{session_id}/artifacts
  The Session Artifacts panel reads artifacts through TanStack Query and lets
  every session user preview or download content through manager-issued signed
  URLs. The Console no longer exposes the legacy browser upload flow.
  SessionArtifactsPanel owns local list/preview navigation. Selecting a row
  replaces the list with an auto-loading shared viewer; Back to artifacts
  restores the list scroll position and focused row. Do not append the preview
  below the full list. Resource panel headings, tabs, and close controls stay
  fixed while content scrolls independently.
```

## Conversation Runtime Rules

Session runtime display state has one durable authority: the session API's
`runtime_status` field (`idle`, `running`, `waiting_approval`, or `unknown`). Lists,
details, Home work items, and mobile activity dots must not fall back to
`status`, `run_status`, ACP frames, observer state, or agent connectivity. The
current workbench may optimistically overlay `running` or `waiting_approval`
while that window owns an explicitly submitted conversation turn. A local ACP
`end_turn`, conversation error, or acknowledged stop immediately overlays
`done`, `error`, or `cancelled` even when the last `runtime_status` snapshot is
still active. This overlay also controls the current window's composer, stop,
queue, and stream behavior, but is never persisted as session status.
The active workbench polls session detail every 5 seconds; other session
consumers retain their own fallback intervals. ACP `end_turn` and observer
replayed terminal markers immediately invalidate session runtime/detail/list
queries; this notification is separate from durable `turn_done` and must not
transfer history ownership early. Detail runtime transitions also invalidate
session lists, covering an end-frame refresh that raced the final paxd snapshot.
`useUserSession` stamps each successful result with client-only
`runtimeSnapshotRequestedAt`, captured before the request starts. After an owned
turn is accepted, a read started after acceptance returning `idle` clears its
local streaming/approval overlay. Do not require first observing `running` or
matching `latest_turn_id`: that field belongs to the durable history head and
can lag execution. Cached/pre-acceptance requests cannot finish a new prompt.
Use `runtime_turn_instance_id` to distinguish a newer live turn from a local
terminal overlay. Match observer/history completions to the owned turn and
ignore callbacks from aborted streams. A terminal overlay controls both the
header and composer, and cannot mask a newer server-owned turn.
paxd snapshots are the only durable runtime writer. A node-control disconnect
preserves the last execution state and timestamp; it does not turn it into
`unknown`. The workbench badge shows `paxd offline` when the node API reports
`online: false`, without changing the execution state. Node lists poll every
15 seconds by default, every five seconds in the workbench, and refresh on
foreground return; offline nodes continue polling so recovery clears the badge.
Legacy `unknown` values
remain blocked until a new snapshot or explicit reset.
E2EE workbenches follow the same canonical
status rule; their local decrypted stream may optimistically overlay an owned
turn but must never replace a server-reported active or unknown state with idle.

A recoverable `/conversation` SSE transport failure does not terminate the
turn or change its badge to `error`. The current workbench keeps the run
displayed as `running` and immediately hands ownership to the session `/events`
observer, even if the canonical running snapshot has not arrived yet. A
successful observer connection clears the transport notice; observer
`turn_done` or `no_running_turn` completes the local display and starts a
whole-turn history calibration. Every page must be read and the result must
contain that turn's `turn_done` marker before committing; failures are retried
on subsequent metadata polls without discarding the displayed transcript. Only an explicit conversation business-error envelope is a
terminal run error.

For a rare false-alive projection, the workbench overflow menu calls:

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/runtime/reset
Content-Type: application/json

{ "expected_turn_instance_id": "<runtime_turn_instance_id>" }
```

This is a compare-and-reset request. The UI must echo the current read-only
turn instance ID, confirm the action, explain that it does not cancel or
terminate the underlying task, and invalidate session detail plus both session
list query families after acceptance.

The current runtime files are:

```txt
src/features/runtime/agent-tunnel-runtime.ts
src/features/runtime/use-agent-tunnel.ts
src/features/runtime/conversation-run.ts
src/features/runtime/use-conversation-run.ts
src/features/runtime/normalize-tunnel-frame.ts
src/features/runtime/merge-session-events.ts
src/features/runtime/session-events.ts
```

The session workbench sends user prompts through the manager-side conversation
run endpoint:

```txt
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/conversation
Accept: text/event-stream
Content-Type: application/json
```

On creation screens, sending with no text or attachments initializes an empty
session immediately. There is no separate Advanced / Create empty action.
Use a leading-edge 500 ms repeat guard plus an in-flight lock shared by keyboard
and button submission. Existing sessions never send an empty user message.
Manager transport uses `initialize_only: true` with creation-only workspace,
Project and permission fields; it must not manufacture a prompt or turn. E2EE
uses its normal encrypted native bootstrap with an empty initial prompt and
skips session/prompt. Preserve native-assignment ordering and transport safety.
Home passes a one-shot initialInitializeOnly intent to the shared workbench.
Clear the session composer synchronously when submission starts, before waiting
for `turn_started` or the send promise. Restore the exact draft on rejection only
if it has not been edited since submission. Acceptance and completion must not
clear later input, even identical text; a stream failure after acceptance must
not restore the already-sent prompt. Keep the repeat and in-flight guards intact.
After a plaintext session is assigned, the same permission selector remains
available. Selecting a choice posts to the session-scoped permission endpoint;
the UI only accepts the returned effective session config after Manager has
successfully applied the corresponding live ACP mode or config option.

For plaintext sessions, the workbench also reads the agent's durable session
configuration snapshot:

```txt
GET   /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration
PATCH /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration/options/{config_id}
POST  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration/refresh
```

Manager updates this snapshot from `session/new`,
`session/set_config_option` responses, and
`session/update:update.sessionUpdate=config_option_update`. The Console polls
the snapshot every 10 seconds, so model, reasoning, and boolean fast-mode
changes reported during an active turn become visible without recreating the
session. Select changes are restricted to values in the latest advertised
catalog. Permission-category `mode` remains owned by the permission selector.

ACP has no standard read-only model-list query. The refresh endpoint re-applies
the current model config value (or the first non-permission config when no
model option exists) through `session/set_config_option`; that method's
response is the fresh complete `configOptions` snapshot. This request may run
alongside an active prompt, but other config controls for the session are
serialized. Treat refresh as a deliberate no-op write, not a read-only RPC.
Legacy `models.currentModelId/availableModels` is displayed read-only because
`session/set_model` never became standard. E2EE sessions do not expose this
Manager-owned snapshot. Both paxd and any direct tunnel client must advertise
`clientCapabilities.session.configOptions.boolean={}` during initialize so
agents can include boolean options such as fast mode.

Failures before the SSE stream starts use the standard JSON API envelope:

```json
{
  "data": null,
  "code": 409,
  "message": "project is archived"
}
```

After the stream starts, failures arrive as an SSE error envelope with both
`status_code` and `message`. The Console preserves those values in `ApiError`
and displays them as `HTTP <status>: <message>`.

While a turn is running, the workbench stop button calls:

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/stop
Idempotency-Key: <client-generated command id>
Content-Type: application/json
```

with `{ "reason": "user_requested" }`. This sends a manager-side stop command
and does not abort the browser's active SSE reader; live updates can continue
until the backend and agent finish cancelling.

The session observer automatically reconnects when the browser `fetch` stream
fails at the network layer, ends before a terminal event, or receives a
transient 408/429/502/503/504 response. It keeps the same history cursor and
buffered timeline, uses capped exponential backoff, and stops retrying on
authentication, other non-transient API errors, unmount, or session change.

While a turn is running, composer submit queues the current draft through:

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/queue
Idempotency-Key: <client-generated command id>
Content-Type: application/json
```

with `{ "input": "..." }`. The backend keeps one replaceable queued draft per
session; sending queue again before dispatch claims the slot replaces the
pending draft. Manager persists the slot and sends it when an applied paxd
snapshot confirms the session is idle, independently of the browser stream.

The steer button calls:

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/steer
Idempotency-Key: <client-generated command id>
Content-Type: application/json
```

with `{ "input": "..." }`. This is manager-side stop plus queue: it sends the
ACP `session/cancel` notification for the current prompt, then runs the queued
prompt after paxd reports idle. Closing the page does not cancel the queued
dispatch, and pending slots survive Manager restart. The existing
`/conversation` SSE request is not the queued turn owner.

The workbench observes background or second-window turns through:

```txt
GET /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/events?turn_id=<turn_id>&after_seq=<head_seq>
Accept: text/event-stream
```

For a standalone `/sessions/{session_id}` route, the frontend first locates the
session in the paginated flat sessions list and uses its authoritative
`node_id` and `agent_id` for queue and observer requests. It must not fall back
to the first available agent while that lookup is pending.

The endpoint is pinned to one business turn. Omit `turn_id` only on the first
connection to select the active turn (running or waiting for approval); an idle
session emits `no_running_turn` without replay. Reconnect sends that same
`turn_id` and the last committed `head_seq` as `after_seq`. The legacy
`after_message_id` is rejected, not silently ignored.

The stream starts with `turn_start`, replays the complete durable turn as
`history_item`, and commits the batch with `head`. Subsequent items replace
message versions by `message_id`; `history_remove` removes superseded display
rows. `session_seq` orders rows but does not change when text grows, so reconnect
must refresh the prefix even when a watermark is supplied. A cursor ahead of
the target turn is rejected; no cursor can expand replay to other turns.

Manager currently checks the durable turn every 500 ms and sends changed
versions. The browser also polls session metadata every five seconds while visible and
uses durable history to repair gaps and calibrate completed turns. `applyObserverTranscript` stages a reconnect batch
until `head`, retaining the prior view if replay disconnects halfway through.
A committed snapshot replaces that turn's previous history/conversation view.
A durable `turn_done` marker ends the stream. History retakes ownership only
after every page of the target turn has been fetched successfully. `resync` reconnects to the same turn. Legacy ACP observer
normalization remains for compatibility with older servers.

Deploy Manager and Console together: old Console uses a rejected cursor
parameter, and the snapshot contract is not supported by the old Manager.

New sessions usually send `{ "input": "..." }`; when prompt attachments are
present, the browser sends structured `content` blocks instead:

```json
[
  { "type": "text", "text": "Please inspect this file" },
  { "type": "attachment", "attachment_id": "att_..." }
]
```

Continued sessions add `"session_id": "sess_*"`. A `turn_started` acknowledgement
clears only the attachments included
in that submission; do not wait for the response stream to finish or clear files
added for a later prompt. Keep sent attachment names and MIME types on the live
user event, and recover them from durable `session/prompt` resource links for
history. User message bubbles show file labels and lazy image thumbnails for
PNG, JPEG, GIF, WebP, AVIF, and BMP. Clicking a thumbnail opens a keyboard-accessible
dialog with the full image; failed loads retain the filename and a retry action.
`GET /attachments/{attachment_id}/content` goes through the same-origin proxy;
Manager checks ownership, completion, and storage bucket before issuing a
short-lived signed object redirect with `Cache-Control: private, no-store`.
History recovers IDs only from the direct `att_<48 hex digits>` parent directory
in Paxd's localized file URI. Unknown legacy resources remain labels; never use
node-local `file://` paths as browser image URLs. Queue/steer endpoints remain
text-only. The browser reads the POST response body as a stream of default SSE
`data:` messages. Each message is a PAX envelope:

```txt
type=session       Save the returned manager session id and replace the URL.
type=turn_started  Adopt the opaque business turn_id before visible output.
type=acp           Pass envelope.frame to normalizeTunnelFrame; preserve turn_id.
type=turn_done     Complete that business turn after durable history is query-visible.
type=done          End only this request stream; it has no turn_id.
type=error         Surface the message and end the streaming state.
```

`approval_required` and `interrupted` preserve the active business `turn_id`.
A `permission_required` interruption pauses that turn; the following request-
scoped `done` must not complete it. Permission resume reuses the same turn ID,
while a queued follow-up receives a different ID. Durable history stores all
turn projections with `turn_id` and ends the turn with a
`message_type=turn_done`, `status=complete` marker. Timeline reconciliation
keeps history, the owned conversation stream, and observer replay as separate
ordered sources; it must not timestamp-sort them because replayed ACP frames
receive client arrival timestamps. A locally owned conversation replaces only
that turn's agent projection while retaining the durable user prompt at the
turn's original history position. A committed observer snapshot replaces the full target turn; message identity,
not repeated-text filtering, determines the resulting projection. Once all pages of the completed turn have been calibrated, durable history owns the turn.
Durable storage may aggregate every `agent_message_chunk` in that turn into a
single row anchored at the first chunk. History normalization therefore places
that aggregate after the turn's work events and immediately before the durable
turn boundary. Consecutive `text_layout=segment` rows with adjacent
`session_seq` values are one visible text block and must be concatenated
without inserting whitespace; a sequence gap or visible work event preserves
the segment boundary. Live streams continue to use receipt order.

Session names are updated through the existing node/agent-scoped endpoint:

```txt
PATCH /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}
{ "name": "Release planning" }
{ "use_reported_name": true }
```

Manager responses expose the effective `name`, the latest agent-provided
`reported_name`, and `name_is_custom`. A custom name takes precedence over
periodic paxd session reports until the user explicitly restores the reported
name. After a successful update, refresh both session metadata and the
user-scoped `session-list` query namespace.

Each daemon agent connection exposes `report_local_sessions`. It defaults to
`false` and can be changed from the connection edit form. When disabled, paxd
must omit sessions discovered only from local agent logs, while continuing to
report native sessions present in its manager-created ACP route table. This
exception keeps Console-created session discovery and reported-name updates
working without uploading unrelated local sessions.

Paxd also forces this route-only behavior whenever more than one configured
remote identity shares the same normalized Cloud API URL. Local paxl results
have no account ownership metadata and must never be fanned out across those
accounts, even if a connection has explicitly set `report_local_sessions=true`.

`AgentTunnelRuntime` is retained for direct ACP tunnel experiments and legacy
coverage, but React session components should use `useConversationRun` for
normal composer sends. Components must not build or parse raw ACP frames.
The manager now owns this ACP startup/send flow:

```txt
connect wss://api.paxworkspace.net/api/v1/user/self/agents/{agent_id}/tunnel
initialize
authenticate, only when initialize returns a usable auth method
session/new, lazily before the first prompt
session/prompt, using the ACP/native session id
session/update notifications -> normalized SessionEvent[]
agent_message_chunk / agent_thought_chunk -> turn-scoped streaming events
```

Actual ACP streaming frames observed from the backend look like:

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "acp-session-id",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": { "type": "text", "text": "hello" }
    }
  }
}
```

`normalizeTunnelFrame` extracts `params.sessionId`, `params.update.sessionUpdate`, and `params.update.content.text`. `AgentTunnelRuntime` assigns a turn-scoped stream id when `sendUserMessage` starts. `merge-session-events.ts` appends chunks with the same stream id so the UI renders one growing message instead of one card per token.
Unknown or control-only `session/update` values, such as generic `update` frames and unsupported `*_update` frames, are ignored by `normalizeTunnelFrame` so raw ACP protocol payloads do not render in the user-facing timeline.

Codex-style `usage_update` notifications carry current context occupancy as
`used` and `size`; normalize them to hidden `context_usage` events. The
terminal prompt response may carry per-turn token details in `result.usage`;
normalize those separately to `token_usage`. Turn grouping retains the latest
context snapshot and final token usage and shows a dashboard icon beside the
existing Done/copy/feedback controls. Its hover/focus tooltip contains context,
compaction, cache, and exact token-count details. A tool update with
`_meta.contextCompaction=true` marks compaction;
the latest context snapshot before it and the first snapshot after it provide
best-effort before/after values. Missing usage or compaction-adjacent snapshots
must not prevent the turn footer from rendering.

PAX invocation display messages use `message_type = "pax:invocation"`.
Intermediate invocation cards use `message_type = "pax:invocation_pending"`;
they render immediately and are replaced when the final `pax:invocation`
lists the pending message id in `raw_json.replaces_message_ids`.
History normalization first projects the message list through the invocation
display contract: render each invocation at `parent_message_id`, hide
`raw_json.replaces_message_ids`, and hide the parent when that list is absent.
Live `session/update` frames with `message_type = "pax:invocation"` or
`message_type = "pax:invocation_pending"` normalize to the same invocation
timeline event, and `merge-session-events.ts` applies the same replacement
rule if the real or pending event has already rendered.

Agent artifact cards use `message_type = "pax:artifact"`. History is the
reliable source: the frontend extracts `publication_id` from
`parts[*].payload_json.publication_id` or `artifact-publication://...` URIs,
renders one timeline card per publication id, polls
`GET /artifact-publications/{publication_id}`, and only calls
`/content/main` for preview/download handling. Available publications and
legacy session artifacts both mount the shared ArtifactViewerShell; the shell
owns Preview / Download / Open page / Open file / fullscreen and delegates only
its content region to the builtin document renderer registry. Embedded viewers
stay compact for quick inspection. Their Open page action routes to the
AuthGate-protected full-width preview at
`/artifacts/publications/[publicationId]?ref=...` or
`/artifacts/files/[artifactId]?ref=...`; those pages reuse the same renderer,
auto-load a short-lived URL, and do not expose public artifact links.

Contiguous thought/progress and tool calls use the same collapsed activity row
from the first event. An explicit streaming thought displays `Thinking…`;
recognized running tools use concise actions such as `Reading files…` or
`Running tests…`, and unknown tools use `Using tools…`. Multiple running tools
show `Using tools · N running`; queued or mixed activity is labeled accurately.
With no active tool or latest live thought, use `Working…` without inferring
thinking or retries. Raw tool names and payloads stay inside expanded details.
During streaming, retain the lightweight pending indicator after commentary
unless the last item is an active activity row with its own feedback. Do not
gate it on whether the turn has ever produced output. Idle, terminal, unknown,
and waiting-approval states hide the indicator; it does not infer tool progress
or alter runtime status. The CSS animation respects reduced-motion preferences.

A completed block shows a leading disclosure arrow and `Worked for 18s` (or
`Worked for 1m 18s`), without an operation count or a separate duration badge.
Use `Worked` when the actual closing boundary has no valid timestamp.
This is activity-block timing, not
session runtime status. A single tool uses the same collapsed row. Expanding
a block reveals individual thought/tool rows without an intermediate Tool calls
group. Tool errors stay in the expanded evidence; never turn them into a terminal
session error, an automatic frontend retry, or a user-facing Retry action. Only
a real subsequent invocation can establish that the agent is retrying.
Pending tool permissions stay actionable outside the disclosure, and are omitted
from its inner rows while pending to avoid duplicate decision controls. Existing
approval scopes, pending locks, decisions, history detail loading, patches, and
Tool evidence remain intact. Normal messages and standalone actionable events
close the block; the closing timestamp is view-projection metadata only.
The timeline uses an 8px row gap; agent and user copy uses
14px type with a 20px line height, while Markdown H1/H2/H3 use 18px/16px/15px
type and blockquotes use 13px type. Session and Home composer input uses the
same 14px/20px typography as body copy on desktop. Below 640px, composer input, agent/user messages, and form controls use
16px type; message and composer line height is 24px. Larger layouts retain
their component sizes even with a touchscreen. Never disable user pinch zoom.
Command suggestions scroll vertically only and wrap long names, descriptions,
and hints within the composer width. Markdown blocks keep 6px paragraph
spacing. Agent-message and work-group items add no extra vertical padding, so
adjacent text-to-work spacing stays at that 8px gap.

ACP permission prompts are JSON-RPC requests, not `session/update` notifications:

```txt
method: session/request_permission
params.sessionId
params.toolCall
params.options[] with optionId, name, kind
```

The manager-side conversation stream emits `approval_required` followed by
`interrupted` with `reason=permission_required`. The workstream renders this as
a permission card. Clicking a decision first calls:

```txt
POST /api/v1/user/{user_id}/approvals/{approval_id}/decision
```

The fixed `decision_option` values are:

```txt
deny
allow_once
allow_for_this_agent
allow_for_this_node
allow_always_on_all_agents
```

Do not pass `resume_reason`, and do not resume by `native_id`; `native_id` is
the lower-level ACP permission request id and is manager-internal. If
`approval.options` from the conversation event contains older names such as
`allow_for_this_session` or `allow_always_on_this_node`, the workbench should
still submit only the decision API allowlist above.

After the decision succeeds, the workbench resumes the current conversation
stream with:

```json
{
  "session_id": "sess_*",
  "resume": { "approval_id": "appr_*" }
}
```

PAX Manager converts the decided approval back into the ACP JSON-RPC response
for the original permission request.

Manager persists manual permission requests before broadcasting them, even
without an initiating conversation stream. Observer/history frames must carry
the durable approval ID. Serialize decision submissions, but once the decision
is saved, a still-pending resumed conversation must not disable a different
permission request's buttons.

Only Deny and Allow once are currently exposed in timeline and Home approval
actions. Keep the other decision values compatible with existing history, but
do not offer persistent grants in these controls.

Reconcile permission decisions independently of timeline ownership and tool
card nesting. Durable decisions must survive live turn replacement; match ACP
request IDs within their session and turn so reused IDs cannot settle another
request. Locally saved manual decisions override inferred auto-approval labels.

Do not confuse the two session ids:

```txt
PAX Manager session id
  Created by POST /conversation on the first prompt and used in URLs, REST message history, and product context.

ACP/native session id
  Created by session/new by PAX Manager and kept private behind the conversation endpoint.
```

Known gaps include broader ACP event coverage beyond observed text chunks.

## UI Composition Rules

Current screen layers:

```txt
src/app/*
  route entrypoints

src/components/shell/*
  app chrome

src/components/home/*
  Home sessions/inbox workbench, embedded session workbench, and context composer

src/components/resources/*
  reusable resource pages for sidebar tabs

src/components/sessions/*
  session workbench

src/components/artifacts/*
  Shared permission-safe document viewer for both timeline publications and
  legacy session artifacts. Source adapters normalize both resources into one
  ArtifactDocument; the builtin renderer registry resolves image, PDF, HTML,
  Markdown, text, JSON, JSONL, CSV, or download fallback. Text renderers enforce
  preview byte/line/record/table budgets, and HTML stays inside a sandboxed
  iframe with `allow-scripts` only (never `allow-same-origin`). The Manager
  `download` hint describes direct URL handling; recognized types still use
  local renderers. Fetch URL previews within the blob budget and render blob
  URLs; normalize HTML blobs to `text/html`. Keep signed URL acquisition in the source-specific API adapter.
  Timeline cards and the Session Artifacts panel provide a compact viewer plus
  an Open page link; the dedicated full-width route reuses this shell with
  auto-load rather than defining a second rendering stack.

src/components/collaboration/*
  Collaboration workspace pages. Teams (/collaboration/teams) and Friends
  (/collaboration/friends) are separate canonical routes; the teams page is
  split into teams-page-client,
  team-list-panel, team-detail, and per-tab section files. Mutation cache
  invalidation goes through src/features/api/invalidation.ts.

src/components/ui/*
  local UI primitives such as Button, Badge, SearchBox, Tooltip, TruncatedText,
  PaxLogo, EmptyState, InlineError, SectionTitle, ConfirmDialog

src/features/*
  API, auth, runtime, stateful business boundaries
```

Components should not know Cloudflare internals. Components may show errors, but auth/proxy behavior belongs in `features/api` or `app/api/pax`.

Use `src/components/ui/button.tsx` for command buttons, `badge.tsx` for compact actionable status labels, `search-box.tsx` for search inputs, `dropdown-menu.tsx` for click-to-open menus (e.g. the topbar user/sign-out menu), and `text.tsx` for long IDs/names. Agent ids, node ids, session ids, API key prefixes, endpoint paths, and file paths should be truncated with tooltip access to the full value. Prefer `compactId` from `src/lib/format.ts` when an id should be recognizable but not visually dominant. Button uses Radix Slottable for `asChild`; link buttons must keep one slottable anchor while icons remain valid siblings.

`Button asChild` may render an icon beside its delegated child because the
primitive marks that child with Radix `Slottable`. Callers must still provide
one React element, such as an anchor, as the delegated child.

The UI direction is Codex-like dark workbench, not a generic dashboard. Prefer split panes, compact rows, timelines, and evidence panels over large hero sections, KPI-card grids, and floating card sections. Cards are reserved for selectable entities, modals, and isolated tools. Ordinary metadata should be muted text or monospace text; use `Badge` for states that need scanning or action, such as connected, running, failed, approval required, revoked, or offline.

The signature accent (`--color-accent` #5e6ad2, with `--color-accent-bright` #96a0ff for small text/icons) is reserved for small interactive signals: selected-state tinted backgrounds (bg-accent/10, hover bg-accent/15; bg-accent/15 with accent-bright text for segmented tabs), left indicator bars, focus rings and glows, and hover emphasis. Do not use accent fills or gradients as large-area brand decoration. The body carries a very subtle accent radial gradient for depth, and `::selection` uses the accent color. Entrance micro-animations use the `motion` package (`motion/react`); keep them short (~200ms) and subtle.

Sidebar collapsed state is client-only UI state and belongs in `useConsoleStore().sidebarCollapsed`.

Sidebar layout rules:

```txt
ConsoleLayout uses flex, not CSS grid columns.
The console shell is fixed to the dynamic viewport and owns page-level
overflow. Shell children must fill the available flex height instead of using
100vh or min-h-screen; scrolling belongs to the relevant inner pane.
Sidebar controls its own width with inline width 248/76px and overflow-hidden.
Mobile widths hide the Sidebar, keep a compact Topbar, and expose a fixed
Home / Collaboration / Settings bottom navigation.
Sidebar uses a quiet surface and compact nav rows without a persistent current-node block.
Do not reintroduce dynamic Tailwind class strings like grid-cols-[76px_1fr] for shell width.
Collapsed tabs show icons only; labels must remain available via Tooltip.
```

## Current Sidebar Routes

The sidebar is intentionally hierarchical. Keep first-level nav coarse: only
Home and Collaboration live at the top. Everything else (the former Runtime
workspace and the settings pages) sits in one Settings group pinned to the
bottom of the sidebar. First-level groups are independent disclosures, not an
accordion; multiple groups may stay open at the same time.

```txt
Home             /
Collaboration    /collaboration/teams
                 children: Teams, Friends, Envelopes, Knowledge
Settings         bottom-pinned group; /settings
                 children: Devices, Projects, Service status, Advanced settings
```

These deep links should remain directly reachable:

```txt
/                              Home
/sessions/new                  New session
/sessions/[sessionId]          Session workbench
/artifacts/publications/[id]       Full-width publication preview; ?ref=main
/artifacts/files/[id]              Full-width session artifact preview; ?ref=main
/inquiries                     Home action deep-link
/conversations/[conversationId] Conversation deep-link
/collaboration/teams           Teams
/collaboration/friends         Friends
/collaboration/envelopes       Envelopes
/collaboration/knowledge       Knowledge
/settings                      Settings directory
/settings/devices              Devices; ?view=agents selects Agents
/settings/devices/add          Quick connect / Pair with code
/settings/projects             Project hierarchy and launch Targets
/settings/service-status       PAX health, devices and agents independently
/settings/advanced             Advanced settings directory
/settings/advanced/permissions Active approval grants
/settings/advanced/encryption  Browser keys and encrypted-device pairing
/settings/advanced/api-keys    API key management
/settings/advanced/node-registration Manual registration tokens
/nodes/[nodeId]                Node detail
/agents/[agentId]?nodeId=...   Agent detail
```

When adding a sidebar item, add both a real `src/app/**/page.tsx` route and an
active-state mapping in `src/components/shell/sidebar.tsx`. Prefer adding a
secondary tab to Collaboration or the bottom Settings group when the
destination belongs to those workspaces. Settings is for low-frequency
configuration and observability, not user work: inquiries and conversations
remain Home deep-links. Devices and Developer may use page-local segmented
views because they intentionally aggregate closely related resources. Home
owns the user-facing Sessions tab; do not re-promote Sessions as a sidebar item.

PAX Manager exposes Home sessions through
`GET /api/v1/user/{user_id}/sessions?page_size=20&page_num=...`, with optional
comma-separated `node_id` and `agent_id` filters plus `include_archived=true`.
Archived sessions are excluded by default. Home uses this flat paginated list
instead of scanning every node/agent session collection. The initial page loads
20 sessions and the left rail fetches the next page as the user scrolls.
Session ordering uses `last_user_message_at`, the latest accepted user prompt.
Assistant streaming, thoughts, and tool activity must not reorder rows; legacy
records fall back to `last_message_at`, then `updated_at`.
The unified Home rail exposes one filter control containing multi-select Agent
and Node option lists plus Include archived. Selected rows use a subtle
background and trailing checkmark instead of leading checkboxes. Long option
labels stay within the filter panel and truncate visually while preserving
their full tooltip.
All sessions appear once in the Home recent list, grouped Today / Yesterday /
Previous 7 days / Earlier. Project filter is secondary and does not alter the
creation Project. Archive/restore remains on each row. Session navigation stays
at `/?session_id=...`; legacy `sessionId` links remain normalized. New-session
links preserve modified-click navigation to `/sessions/new`. Retired local tab
IDs are not durable sessions and removing their presentation never deletes or
stops a session. The rail scrolls independently beneath fixed controls.

Existing workspace paths are shown once in the header, selectable, with no copy
button or editing control. Message copying remains available. Composer has one
Session settings trigger summarizing model and permissions. Its panel renders
all dynamic ACP configuration options as compact selects or boolean switches,
plus permissions (including confirmation and loading/error states). Creation
also places the encryption toggle here; models become available after the
agent reports configuration. E2EE does not expose Manager configuration APIs.
The + menu contains upload and existing-session secure secret delivery. Queue
and Stop remain accessible; Steer retains its mobile overflow behavior.
Home / Collaboration / Settings navigation and admin gating remain intact.
SessionDraftInput keeps its per-keystroke subscription isolation.

Android preview packages use a Bubblewrap-generated Trusted Web Activity with
package id `net.paxtech.console`. Keep `public/manifest.webmanifest` linked from
the root layout, and keep the signing certificate fingerprint in
`public/.well-known/assetlinks.json` aligned with the APK keystore. Without the
Digital Asset Links file on the existing `https://paxworkspace.net` deployment,
Android falls back to a Custom Tab with browser chrome rather than the verified
full-screen TWA. This does not require a second console deployment. Cloudflare
Access must allow anonymous reads of `/.well-known/assetlinks.json` so Android
can verify the origin.

Currently implemented API-backed actions:

```txt
Home New session composer
  Opens canonical /sessions/new without creating a server session

Home session rail
  Refetches on window focus and every 15 seconds while mounted. Session
  assignment and runtime completion also invalidate the user-scoped session
  list so status, preview, timestamps, and ordering do not remain stale. Its
  TanStack Query namespace is `session-list`; do not use the `sessions` prefix,
  which belongs to session-scoped metadata, history, artifacts, and observer
  cursor dependencies.

Session workbench composer
  POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/conversation
  with fetch streaming; type=acp frames still go through normalizeTunnelFrame

Node and agent details
  GET /api/v1/user/{user_id}/nodes/{node_id}
  GET /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}

Node daemon control
  GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/status
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/restart
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/upgrade
  GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/harnesses
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/harnesses/discover
  GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections
  PATCH  /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}/stop
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}/restart
  DELETE /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}
  GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/commands/{command_id}
  GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/secret-channel/open
  POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/secret-channel/push

Secret channel push (`src/features/secret-push`, `NodeSecretChannelPush`) is
a one-shot, single-use envelope for handing paxd a credential without
pax-manager ever holding a decryption key. It is not part of the E2EE
pairing stack (`src/features/e2ee`): no session, no device registry, no key
epoch. Do not merge the two — `secret-push` seals exactly once per send
against a fresh public key paxd hands out per `secret-channel/open` call,
matching `paxd/internal/secretchannel/crypto.go` byte-for-byte (ECDH P-256 +
HKDF-SHA256 zero-salt + AES-256-GCM); changing the AAD/HKDF label encoding
on either side without the other breaks decryption silently.

Each click opens and pushes once. Never automatically reopen/resend on expired:
paxd may also return it for an unknown channel after losing in-memory state.
Ask the user to check the node before manually retrying. Clear the input when
sending starts and use a direct async handler, not a TanStack mutation that
could retain plaintext through variables or a captured closure.

Monitor route
  GET /api/v1/health

API Keys route
  GET    /api/v1/user/{user_id}/api-keys
  POST   /api/v1/user/{user_id}/api-keys
  DELETE /api/v1/user/{user_id}/api-keys/{key_id}

Node registration route
  POST /api/v1/user/{user_id}/node-registration-tokens

Approvals route
  GET  /api/v1/user/{user_id}/approvals
  POST /api/v1/user/{user_id}/approvals/{approval_id}/decision
  GET  /api/v1/user/{user_id}/approval-grants
  POST /api/v1/user/{user_id}/approval-grants/{grant_id}/revoke

Inquiries route
  GET  /api/v1/user/{user_id}/agent-owner-info?agent_id=...
  GET  /api/v1/user/{user_id}/representative-agents?runtime_agent_id=...
  POST /api/v1/user/{user_id}/representative-agents
  POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/inquiries
  GET  /api/v1/user/{user_id}/conversations/{conversation_id}/messages
```

Do not regress these routes into placeholders.

Settings / Devices / Nodes exposes guarded row actions for immediate paxd
restart and upgrade. Restart requires confirmation. When the upgrade dialog
opens, it resolves the newest stable artifact for the node's reported OS and
architecture through `GET /api/v1/public/paxd/download`, shows that exact
version, and disables redundant upgrades when the node already runs it. Both
actions generate a client command id and display the acknowledged command so
operators can correlate it with daemon logs and the new boot heartbeat.

## Documentation Maintenance Requirement

When an agent changes any of these, it must update both docs:

```txt
docs/architecture.zh.md
docs/agent-operating-guide.md
```

Changes that require documentation updates:

- API base URL behavior
- Cloudflare Access behavior
- local tunnel or dev hostname behavior
- REST proxy behavior
- WebSocket or ACP protocol behavior
- shell layout, sidebar collapse, or UI primitive behavior
- directory structure
- state ownership boundaries
- package/stack decisions
- local setup commands

If no doc update is needed, mention that explicitly in the final response.

## Verification

Prefer at least:

```bash
pnpm typecheck
```

For UI or integration changes, also run the relevant browser check against:

```txt
https://paxworkspace.net
```

Use the Browser plugin for visible app verification when available.

## Session command completion

For Manager-transport sessions, the existing session `/configuration` response
also includes an optional `commands` snapshot with `available_commands` and
`observed_at`. Manager persists newly received `available_commands_update`
notifications in session metadata. No legacy journal/history backfill is
performed. An absent snapshot means no advertisement has been observed; an
empty list clears previous suggestions. ACP command objects retain `input`,
`_meta`, and other extension fields.

`SessionWorkbench` passes this server data from the existing TanStack Query
configuration hook to `SessionComposer`. The existing 10-second configuration
poll refreshes command suggestions, including during a running turn. Browser
refreshes read the durable snapshot without querying the agent or loading old
conversation pages. Configuration force-refresh does not request commands.

`session-command-input.tsx` offers completion only for a leading slash token.
Arrow keys navigate, Enter/Tab or a click inserts the command, and Escape
closes the list. Selection never submits or executes `_meta.commandAction`;
sending still uses the existing prompt/queue path. Parameter hints come from
the advertised `input.hint`. Unknown commands remain sendable as plain text.
E2EE sessions do not use Manager command snapshots.

The main prompt and queued-message editor share this completion component.
Existing sessions on Home and the standalone Session page both mount the same
workbench. Home's new-session draft also uses the shared input, but has no
session catalog until initialization; do not borrow another session's commands.
Inquiry/envelope forms and the E2EE diagnostic lab are separate surfaces.

After an automatic cold resume, paxd sends a `_pax/session_resumed`
notification with the native session ID and complete agent resume result.
Manager maps the ID and persists model/config options from that result; the
configuration query then refreshes the selectors. The notification is internal
state and must not render a chat message or complete a turn. Explicit resume
requests retain the original response result. Commands still arrive through
independent `available_commands_update` notifications.

## Node browser control

Node detail includes an explicitly opened Browser panel. Its API adapter lives
in `src/features/browser-control` and uses same-origin `/api/pax` POST requests
to `/api/v1/user/{user_id}/nodes/{node_id}/daemon/browser`. Manager checks node
ownership and forwards transient node-control queries; no extension/admin/VNC
credential belongs in frontend state. This inherits the node tunnel's current
single-Manager-instance routing constraint.

TanStack Query owns permission state; secret plaintext stays solely in the
existing secret sender until encryption. One-use references bind native worker,
origin and password target. The registered file expires after sixty seconds.
Do not put the plaintext, screenshots or RFB chunks in query/mutation caches,
chat drafts, local storage or ACP history. Operator image state is ephemeral.

Native viewing uses automatically refreshed JPEG plus one-use screenshot references
for input. Takeover pauses agent tools until release or leaving the viewer. Password
filling imposes a separate persistent observation hold. The operator explicitly
confirms that the page is safe before releasing that hold. Closing a panel releases its temporary takeover but never releases the
separate sensitive observation hold.

Docker viewing uses pinned noVNC with `VNCChannel`, a bounded, sequential raw
channel over transient node queries. It closes on an ambiguous exchange rather
than replaying bytes. It is a shared Docker display, and adds round trips versus
direct noVNC WebSocket. No clipboard bridge or credential input is exposed by
the wrapper UI. Native password grants do not apply to the unrestricted Docker
MCP broker. Keep deployment/limitations aligned with agent-browser-runtime's
`docs/pax-browser-mvp.md`.

The Docker desktop viewer uses a 16:9 container matching the node desktop,
including on mobile. Its helper text distinguishes Docker from personal Chrome
and explains that an empty Docker desktop can be black. No browser is launched
just by connecting the viewer.

Native Chrome Watch browser is a read-only preview available without takeover.
Selecting a worker starts sequential refreshes with a two-second delay between
requests. Hidden pages suspend capture; closing the panel stops polling.
Preview failures retry after five seconds and preserve the last valid frame,
with the last-capture time shown beside the viewer. Known busy, capture-timeout,
page-change and disconnected-worker states use neutral waiting text; unknown
failures and failed operator inputs retain errors. Browser inventory
refreshes automatically. Captures are serialized; input is never replayed.
Runtime heartbeats continue while capture waits for an agent operation, and
expired queued operations are discarded before execution. Worker heartbeats
include optional `pageOpen`; a connected worker can have no open window. The
viewer suspends captures while this worker has a pending site approval or
`pageOpen` is false, hides the previous frame, and shows neutral approval/closed
status. State polling continues so capture resumes when authorization completes
or a new page opens. Preview reads only inspect existing tabs and never create
a browser window. Deploy the native runtime and Console together for closed-window
status; older workers without `pageOpen` retain the existing polling behavior.
A single connected worker is selected automatically; multiple workers require
selection unless a current operator already identifies the worker. It retains page approval checks and the global pause switch;
it neither changes operator ownership nor releases sensitive observation holds.
Preview pixels remain transient. Clicking or typing still requires explicit
takeover and a fresh interaction frame captured during takeover.

Session browser preview

The session header exposes Watch browser in both collapsed mobile and desktop
layouts. It opens a nonmodal floating viewer, leaving the composer usable.
The viewer supports dragging, resizing, expansion and close; closing unmounts
the viewer and stops capture polling. It uses the session's node, not a claimed
PAX-session-to-worker mapping. Select a worker when the node has multiple.

The operator-only tabs query returns stable per-worker tab IDs and hides titles
for unapproved tabs. A selected preview tab does not switch the agent's active
tab; the default follows the agent. Inputs still require takeover and a fresh
frame for that exact page. Both the Console and runtime must be updated.

Transient pointer metadata marks the center of a recent agent interaction
target. It is not the system cursor or a recording of mouse movement. It expires
after eight seconds, is omitted on another page, and contains no input text.
The frontend draws it above the screenshot without modifying the remote page.

Browser site approval requests also appear below the Session header while the
floating preview is closed. The tray and viewer share the node browser-state
query (five-second foreground polling); closing the viewer stops image capture,
not approval discovery. Requests explicitly show their originating browser and
are node-scoped until a PAX-session-to-worker mapping exists. Allow grants only
the requesting browser session; deny remains available while globally paused.
Decision buttons immediately show Allowing / Denying and a sending status.
Acknowledged decisions disappear immediately; shared-state refresh runs in the
background and does not keep the next approval disabled. While an agent action
(including site approval) is active, the native runtime returns a transient busy
result for preview reads instead of blocking the node control tunnel behind it.

The Session floating browser window defaults to preview for both Native Chrome
and Docker. Both use BrowserPreviewImage with ephemeral complete JPEG frames.
Docker requests `view` with `{source:"docker",action:{type:"screenshot"}}`;
paxd captures one input-free full frame locally and closes the sampling TCP
connection. No frontend noVNC connection exists in preview. It refreshes two
seconds after successful capture, five after failure, and stops while hidden.
Take control mounts noVNC; Release control, window blur, hidden visibility,
pagehide, switching source, or closing the viewer ends temporary control.
Refocusing never reconnects noVNC automatically. Native takeover acquired by
this panel is also released on leave; sensitive/password observation holds
are not released. Docker input still uses the existing transient VNC exchange
transport, not the proposed independent WebSocket tunnel. Docker takeover does
not add a broker-level agent pause; native takeover retains its existing gate.
Deploy paxd before Console; Manager and Docker runtime need no change for this
preview route. Actual browser windows remain running throughout mode changes.

Session viewer baseline: keep the existing location, Native/Docker switch and
operator controls. Hide worker and preview-tab selectors in the Session only.
Follow the newest connected native tool.started/tool.finished audit entry;
ignore viewer requests and heartbeat ordering. Takeover pins the operator;
retain the last followed worker when the bounded audit rotates out. If no
worker can be identified, wait for activity instead of guessing. Native
captures follow the worker's active page. Node management keeps manual choices.
Docker remains in the Session. Its runtime has one Openbox workspace and
maximizes Chromium windows; each MCP operation brings its current page to the
front before and after the operation. Multiple agents share the desktop and
follow the latest operation; this is not a PAX-session ownership guarantee.
The original window-follow behavior needs no session-key setup; the newer Docker
preview mode requires the paxd screenshot implementation described above.
Further frontend information-architecture changes are deferred for discussion.

## Compact history and lazy tool details

Manager history reads request `view=summary` with 100 messages per page and seq
cursors. Tool rows carry `tool` metadata and `has_detail`, not full ACP frames or
parts. `normalize-history-message.ts` normalizes these directly and preserves
all message references when terminal output shares a tool ID. Ordinary text,
thoughts, user attachments, permission decisions, and artifact/invocation display
records stay inline. The legacy before_id helper explicitly requests full view.
E2EE history and live ACP handling keep their existing contracts.

Opening an individual tool or selecting its evidence panel mounts
`tool-message-details.tsx`. Resource hooks fetch
`GET /sessions/{session_id}/messages/{message_id}?section=input|output` through
the same-origin proxy. TanStack Query owns cached pages, keyed by user, session,
message, section, history update timestamp, and completion state. While running,
only an open single-page detail refreshes every two seconds; multi-page reads
stay pinned. Completion starts a fresh cache entry. Merely expanding Working or
the tool group fetches nothing. Load more is explicit. Each continuation sends
the server revision; 409 requires Reload details from offset zero. Offsets count
Unicode code points. JSON fragments are decoded only when complete. The evidence
panel resolves its selection against the current timeline so completion/history
updates select the new cache revision. Detail sections display text/JSON; live
rich patch rendering is unchanged, while compact history does not fetch patches
for turn-footer aggregation.

Deploy Manager before Console. Summary mode avoids the old history GET repair
scan; publication reconciliation still happens on write paths. Full history stays
available for older clients. These changes do not split ordinary reply/thought
part 0, cap total inline text bytes, or change paxd persistence.

## Summary history preserves conversation text

Summary pages use a base transport-row cursor and include non-tool context for
the turns present on that page. A long turn must still show its user prompt and
assistant aggregate even when their first-touch sequences precede the latest
100 tool rows. The original base-page cursor remains the next-page cursor.
Canonical prompt text parts stay inline; raw session/prompt text is a fallback
when parts are missing. Flatten pages by message_id and order by session_seq so
repeated turn context does not render twice. Tools remain available in work
groups and load their full details only when opened.

## Durable text segment boundaries

New Manager text rows carry `raw_json.text_layout = "segment"`. They represent
individual text blocks within a turn, not a whole-turn aggregate. Preserve their
message IDs and stored order: A, tool, B must remain A, tool, B after refresh or
observer replay. Do not concatenate distinct segmented rows when an intervening
tool is outside the currently loaded page. Legacy end-of-turn aggregate
reordering applies only to turns without segmented records. Historical merged
text is not heuristically split. Deploy this Console support before Manager.

Standalone artifact readers use one non-scrolling toolbar: a fixed "Back to
session" link, the artifact title (filename fallback), Copy link, Download, and
an options menu for refresh, open file, and file details. Do not fetch session
names for this link; source adapters retain the session/agent IDs. Artifacts
with a source session link to `/?session_id={encodedSessionId}`, selecting that
session in the Home workbench rather than opening `/sessions/{id}`. Artifacts
without a session association retain a generic Back action. Copy link copies
the current protected reader URL, including the content reference, never a
signed content URL. On mobile, navigation/download use labeled icons and Copy
link lives in the options menu, preserving room for the title. Filename (when
different from title), size, and creation date live in file details. Only
loading, processing, and failure states appear beside the title; full errors
remain in the viewer body. Do not show normal-status badges or renderer IDs.

## Snapshot-driven queued turns

Manager persists one queued draft per session (64 KiB maximum), dispatched by
paxd runtime snapshots without a browser conversation stream. Queue GET adds
optional state: queued, sending, uncertain. Poll nonempty queue entries so a
completed handoff cannot leave a stale card. Sending slots cannot be edited or
deleted. Uncertain means receipt was not confirmed; do not automatically resend
or overwrite it. Explicit deletion removes tracking, not an already received
prompt. The observer remains read-only and waits across one periodic snapshot
interval; it does not own queue dispatch. Deploy Manager before Console.

## Discovering subsequent turns

The open workbench polls session metadata every five seconds (other consumers
retain the 30-second default). Runtime refresh also invalidates session metadata,
not just session lists. Observer suppression belongs to a session/turn pair;
changing runtime_turn_instance_id reopens a pinned observer even if runtime status
stays running. Changes in message timestamps or runtime status invalidate history,
so turns that finish between metadata polls still appear. No-running suppression
must never hide all future turns for a session.

### Session history synchronization

Session detail uses the node/agent/session route. Flat session lists are only
used to discover routing when it is unknown. Poll detail every five seconds
while visible; detail includes latest_message_id, latest_message_seq, and
latest_turn_id from durable Manager history, not paxd reporting.

Keep a healthy locally owned conversation stream. Otherwise observe a running
turn through events. On page resume refresh metadata and the history tail;
the workbench also immediately invalidates runtime/metadata queries on window
blur-to-focus, even when visibility never changed, bypassing the polling wait
and cache freshness. Coalesce focus and visibility events for the same return.
Window-focus handling is opt-in on runtime and history-tail refresh hooks; it
must not reopen healthy streams or refetch older history pages on each focus.
Runtime refresh also invalidates nodes. History sync queues a follow-up when
metadata or focus changes during a read, so fresh idle/latest-message/latest-turn
metadata is checked after the in-flight read commits instead of being dropped.
Unknown latest IDs while idle trigger after_seq catch-up starting at the second
newest known message. Follow has_newer rather than treating one page as complete.

On local/observed completion or discovery of an idle latest turn, read
history?view=summary&turn_id=... and follow before_seq until has_older is false.
Only a fully fetched turn containing turn_done is calibrated. Publish all pages
atomically into the session-scoped TanStack history-sync cache; retry failures
on metadata polls while retaining the old view. Calibration suppresses late live
fragments but does not make durable messages immutable. Manager appends/updates
message_parts under the same message_id and session_seq; latest head IDs are
ordering markers, not content revisions (even messages.updated_at need not change).
Every idle metadata poll re-reads the latest turn's complete paginated snapshot,
including already calibrated turns. Resume and explicit calibration also revalidate
calibrated turns encountered in the tail. Replace the entire turn only after all
pages succeed; turn_done confirms completion, while an idle snapshot can be
displayed without that marker. Removed rows disappear and failures retain
the previous snapshot. Without latest_turn_id, idle polls re-read the tail.
A turn_done in an ordinary page alone does not
transfer ownership. E2EE retains its existing history flow.

Older history pages do not refetch on focus. Prepending captures the visible
row ID and pixel offset and restores it in a layout effect before paint; bottom
updates must not affect that offset. Avoid content-visibility estimated heights
on timeline rows. Foreground recovery never resubmits prompts or cancels turns.

### Idle history display without a completion row

Keep fully paginated history snapshots separate from turn completion. An idle
turn snapshot can update the display even without a synthetic turn_done row.
Only turn_done adds a calibrated/completed turn; snapshotTurnIds record full
history reads independently. Snapshot ownership is per turn: starting a new
prompt must not replace previous durable replies with retained partial streams.
Only the active turn's snapshot yields to live events. Prefer the local active
turn ID (including a pending ID) over lagging metadata; otherwise use the reported
active turn ID. When an active turn cannot be identified, retain conservative
live reconciliation. Do not stop a running
conversation merely because a history snapshot was fetched. Failed or empty
incomplete reads retain the prior snapshot.

## Runtime release configuration

The root layout waits for `connection()` and embeds an allowlisted public config
before client hydration. `PAX_RUNTIME_WS_BASE_URL` is a runtime-only WebSocket
origin and overrides the legacy build-time NEXT_PUBLIC_PAX_WS_BASE_URL. The same
Console image can therefore run in staging and production without rebuilding.
Unset runtime configuration preserves the existing hosted/legacy defaults.
Only wsBaseUrl, PAX_RELEASE_ID and PAX_COMMIT_SHA are exposed; never serialize
process.env or PAX_MANAGER_URL/Cloudflare credentials into the browser. Inline
JSON escapes `<` to prevent closing-script injection. REST remains /api/pax.

### Settings organization and device setup

`src/components/settings/` owns the English-first directory, health summary and
Add device flow. Keep pending approvals in Home, device maintenance and secret
transfer in device details, and technical profile fields in expandable advanced
sections. Preserve existing resource and Project/Target CRUD components.
Legacy Security, Developer, Diagnostics, API key and registration URLs redirect
to their new destinations. Mobile pages provide a parent link.

Quick connect uses the same-origin token API without an owner override (the
authenticated user supplies ownership), then assembles an install command using
the configured public runtime origin. It installs paxl first, then installs and
sets up paxd, using each public installer with its matching download-origin
variable. Each pipeline runs under bash pipefail and the steps use &&, so a
failed download/install stops setup. Only the paxd step receives the generated
registration token. Its one-use token stays in page state,
expires after one hour, and can be regenerated. Never log it or store it in the
query cache. Keep `paxl daemon setup` and `/connect` as the pairing alternative.
Ship the paxd installer and binary supporting `--registration-token-env` before
shipping this Console flow. See `settings-migration.md` for preservation checks.

## Output-gap feedback and artifact reader width

The pending-agent dots acknowledge an initial send immediately. After visible
output, they appear only after a 1.5-second quiet gap; each new reply content
resets the timer. Identical history snapshots do not reset it. Active work groups
and non-streaming statuses suppress the dots, and session/turn changes reset the
local timer. This is display-only and never delays events or sends.

Markdown artifacts omit Reader controls in embedded previews. Standalone readers
show the controls/contents column only when the reader container is at least
56rem (896px), not when the browser viewport crosses a desktop breakpoint.
Narrow readers use a single content column and retain stored font preferences.
Recent-session row timestamps occupy the trailing edge of the metadata line;
agent/project/node context truncates in the flexible leading space. Archive
status precedes the timestamp so every row keeps the same time alignment.

Mobile composer attachment menus use continuous anchor positioning while open so
keyboard dismissal and visual-viewport shell reflow cannot leave the menu behind.
The mobile navigation reserves 4rem of content height plus the bottom safe area;
its top padding and bottom content padding are independent of that safe area.
ConsoleLayout reserves the same --console-mobile-nav-height to prevent overlap.
