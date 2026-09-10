# Agent Operating Guide

This file is for coding agents working on PAX Console. Keep it short, factual, and current. When architecture or integration behavior changes, update this file together with `docs/architecture.zh.md`.

## Mobile layout

Mobile layout: keep Queue/Stop directly accessible; Steer is available in the
mobile turn overflow menu and as a desktop shortcut. Bound the permission
trigger width without shortening its accessible name or menu labels. Do not
show the unavailable voice action on mobile. Project selects use a visible
custom chevron and dark surface while retaining native selection. RunBadge
icon/text must share a no-wrap inline flex container. The mobile topbar has a
44px minimum height plus safe-area padding; reload lives in the user menu.
Inline code may move as a unit, but long tokens must still wrap within the viewport.

## Encrypted transport boundary


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
one development root key per agent in IndexedDB, surfaced under Settings /
Security. Root keys must not be put in TanStack Query, localStorage, server
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
- Local browser hostname: `https://ws.lakeward.net`
- PAX Manager upstream: `https://api.lakeward.net`
- Browser WebSocket upstream: `wss://api.lakeward.net`
- Default browser API base: `/api/pax`
- Do not make browser REST calls directly to `https://api.lakeward.net` unless the user explicitly asks to debug CORS.

## Required Mental Model

```txt
Browser
  -> ws.lakeward.net
  -> Next.js app
  -> /api/pax/* same-origin proxy
  -> api.lakeward.net

Browser agent tunnel
  -> wss://api.lakeward.net/api/v1/user/self/agents/{agent_id}/tunnel
```

Cloudflare Access and CORS complexity should be isolated in the Next route handler:

```txt
src/app/api/pax/[...path]/route.ts
```

Do not spread Cloudflare cookie handling into React components.

Home has two resource rails: Sessions and Projects. Projects are logical,
owner-scoped, nestable work groups. A reusable Project Target binds an Agent to
a working-directory intent. The Home composer exposes Project, Agent, and
Workspace instead of asking users to manage Targets. Project and Agent remain
independent. Resolve a workspace only among enabled targets for the selected
Project and Agent: use the default, or the sole match; multiple matches without
a default require selection. Scope typed directories and editor state to that
Project/Agent pair, so changing either never carries a different pair’s path.
Show resolved paths as an editable summary; missing bindings open an inline
input, and saved-workspace choices can explicitly switch to another configured
Agent. Do not switch agents implicitly. Wait for target loading before starting
project sessions. Keep project/location controls above the prompt, omit the
redundant project hero card and clean-session label. An enabled Target with the
same Project, Agent, and cwd is reused; otherwise the Console saves one only
after native session assignment succeeds. The Session's optional
`primary_project_id` is immutable. Do not overload that singular field for
future multi-Project labels; use a separate association model.

## Local Development

Expected local env:

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.lakeward.net
PAX_CF_AUTHORIZATION=<generated by pnpm auth:local>
```

The hosted direct-tunnel default is `wss://api.lakeward.net`. Preserve
`NEXT_PUBLIC_PAX_WS_BASE_URL` as the explicit override for a local or alternate
WebSocket origin. `pnpm auth:local` resolves its application URL from
`PAX_ACCESS_APP_URL`, then `PAX_MANAGER_URL`, then the hosted API default, and
writes that computed URL back to `.env.local` as `PAX_MANAGER_URL`.

Optional: `NEXT_PUBLIC_PAX_LOGOUT_URL` overrides the topbar "Sign out"
target. It defaults to `/cdn-cgi/access/logout`, Cloudflare Access's
same-origin logout endpoint. Sign out navigates the browser straight to
that URL (see `LOGOUT_URL` in `src/features/api/client.ts`); it does not
go through the `/api/pax` proxy.

`next.config.ts` must keep:

```ts
allowedDevOrigins: ["ws.lakeward.net", "*.console-dev.lakeward.net"];
```

Additional LAN origins may be supplied at dev startup through the
comma-separated `PAX_ALLOWED_DEV_ORIGINS` environment variable. Do not hardcode
developer-machine IP addresses in `next.config.ts`.

It also sets `Cache-Control: no-store, max-age=0` for `/_next/:path*`. Keep this while developing through `ws.lakeward.net`; otherwise Cloudflare/browser caching can serve stale Turbopack chunks after UI layout changes.

Use `pnpm dev` for local development. It first runs the local Cloudflare Access
token sync and writes `PAX_CF_AUTHORIZATION` into `.env.local`, then starts
Next.js. Normal development should open:

```txt
http://localhost:3000
```

If the app is accessed through Cloudflare Tunnel, open:

```txt
https://ws.lakeward.net
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
PAX_MANAGER_URL=https://api.lakeward.net
```

Do not set `PAX_CF_AUTHORIZATION` as a production fixed secret. Production
should receive the user's Cloudflare Access identity at `ws.lakeward.net` and
forward it through the same-origin `/api/pax` proxy.
Direct browser agent tunnels connect to `wss://api.lakeward.net` and require a
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
Session queries use 30-second polling only as a disconnected-client fallback.
`unknown` means the node-control connection did not recover within its runtime
report grace period. It preserves the last turn identity and must keep the
composer blocked until a reconnect snapshot or an explicit compare-and-reset
restores an authoritative state. E2EE workbenches follow the same canonical
status rule; their local decrypted stream may optimistically overlay an owned
turn but must never replace a server-reported active or unknown state with idle.

A recoverable `/conversation` SSE transport failure does not terminate the
turn or change its badge to `error`. The current workbench keeps the run
displayed as `running` and immediately hands ownership to the session `/events`
observer, even if the canonical running snapshot has not arrived yet. A
successful observer connection clears the transport notice; observer
`turn_done` or `no_running_turn` completes the local display and starts a
bounded, exponentially backed-off history refetch. Refetch stops as soon as
durable history contains that turn's `turn_done` marker; if the runtime turn id
was unavailable, it waits for a completion marker newer than the pre-handoff
history snapshot. Only an explicit conversation business-error envelope is a
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

The New session composer keeps empty initialization behind its secondary
Advanced menu. `Create empty session` sends `{ "initialize_only": true }`
through the same endpoint, together with creation-only workspace, Project, and
permission fields. It must not manufacture prompt content, an optimistic turn,
or an empty user message. A successful stream emits `session` followed by
`done`; preserve the unsent draft by moving it from the New-session draft key
to the assigned session key. This action is unavailable for E2EE sessions.
The Home `New chat` composer exposes the same Advanced action. It mounts the
normal Session Workbench with a one-shot initialize-only intent, so both entry
surfaces share the same ACP request, permission refresh, and error recovery.
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
active session; sending queue again before the current turn completes replaces
the pending draft. The backend turn sequencer, not the browser stream, sends
the queued prompt after the active prompt returns a terminal response.

The steer button calls:

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/steer
Idempotency-Key: <client-generated command id>
Content-Type: application/json
```

with `{ "input": "..." }`. This is manager-side stop plus queue: it sends the
ACP `session/cancel` notification for the current prompt, then runs the queued
prompt after the current turn returns a terminal prompt response. Closing the
page does not cancel the queued dispatch while the manager process and ACP
tunnel remain alive. The existing `/conversation` SSE request is not the queued
turn owner.

The workbench observes background or second-window turns through:

```txt
GET /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/events?after_message_id=<message_id>
Accept: text/event-stream
```

For a standalone `/sessions/{session_id}` route, the frontend first locates the
session in the paginated flat sessions list and uses its authoritative
`node_id` and `agent_id` for queue and observer requests. It must not fall back
to the first available agent while that lookup is pending.

The endpoint observes the current running turn for that session. If there is no
running turn, it emits `type=no_running_turn` and closes; the UI should stop the
observer and use bounded history refetch to close any conversation/observer
handoff gap. If a turn is running, it replays the
turn-scoped in-memory buffer and then streams live events. `after_message_id`
is the global `HistoryMessage.message_id` from REST history, used only as a
trim hint inside the current turn buffer. If it is not found in the buffer, the
endpoint emits `type=buffer_miss`, skips replay, and keeps streaming the live
tail. On terminal prompt response it emits `type=turn_done` and closes. Normal
live payloads use `type=acp` with the same `frame` shape as `/conversation`, so
the UI should pass `frame` to `normalizeTunnelFrame`.

New sessions usually send `{ "input": "..." }`; when prompt attachments are
present, the browser sends structured `content` blocks instead:

```json
[
  { "type": "text", "text": "Please inspect this file" },
  { "type": "attachment", "attachment_id": "att_..." }
]
```

Continued sessions add `"session_id": "sess_*"`. Queue/steer endpoints remain
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
turn's original history position. Observer replay extends the existing
history/conversation prefix and filters repeated text instead of deleting the
whole turn. Once the completion marker appears, durable history owns the turn.
Durable storage may aggregate every `agent_message_chunk` in that turn into a
single row anchored at the first chunk. History normalization therefore places
that aggregate after the turn's work events and immediately before the durable
turn boundary; live streams continue to use receipt order.

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
connect wss://api.lakeward.net/api/v1/user/self/agents/{agent_id}/tunnel
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

Runs of two or more contiguous thought/progress and tool-call events render as
one collapsed work block, preserving their original order. A single thought or
tool call stays directly visible. The grouped summary is only `工作中` while any
child is active or `工作过程` after completion; counts stay out of the summary,
while pending approvals remain visible. Expanding it reveals the nested thought
rows and adjacent tool groups. Normal messages and actionable standalone events
end the work block. The timeline uses an 8px row gap; agent and user copy uses
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
  iframe. Keep signed URL acquisition in the source-specific API adapter.
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
Settings         bottom-pinned group; /settings/devices
                 children: Devices, Security, Developer, Diagnostics
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
/settings/devices              Nodes / Agents local views
/settings/security             Persistent approval grants
/settings/developer            API keys / registration local views
/settings/diagnostics          Monitor
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
Sessions are nested under their primary Project, and projectless sessions stay
in Recents. Each session row can archive or restore the
session through the existing session PATCH endpoint. In the
new-session agent selector, duplicate agent names are qualified as
`agent @ node`. Clicking a session keeps Home mounted and opens the embedded
workbench at `/?session_id={session_id}`, preserving the Project / Session rail.
Legacy direct links using `/?sessionId={session_id}` remain supported and are
normalized to the canonical snake_case query parameter during initialization.
Home-generated links, including modified clicks that open a new tab, use this
same query-string URL. Starting from either the global or
Project-scoped Home composer opens the embedded new workbench. A Project-scoped
first prompt uses the normal Conversation endpoint with `primary_project_id`
and, when an enabled Project/Agent/cwd match exists, `project_target_id`.
Otherwise it uses the typed cwd and saves the reusable Target after native
session assignment succeeds. There is no separate Target session-creation
endpoint.
On mobile widths, Home defaults to the clean composer. The Project/Session rail
opens as a left drawer over the composer or embedded SessionWorkbench instead
of replacing the whole page.
Below the global mobile Topbar, Home exposes locally opened sessions as a
dedicated horizontally scrolling tab row. Tapping switches directly, closing a
tab offers Undo without stopping its session, and the trailing New session
action returns to the clean composer. The row remains separate from both the
Session tools header and the composer. The global mobile Topbar includes a hard
reload action equivalent to the browser refresh button. Long-pressing a tab
starts horizontal drag reordering; normal horizontal movement continues to
scroll the strip, and tab labels must not become browser text selections.
On mobile, the shared Session tools header starts as a compact disclosure row
showing the session name and ambient security/run state. Tapping it reveals the
existing node, agent, rename, runtime, and side-panel controls; the upward
chevron collapses it again. Desktop keeps the complete header visible. Because
this behavior lives in `SessionWorkbench`, it must stay consistent for both the
embedded Home workbench and standalone Session routes.

Android preview packages use a Bubblewrap-generated Trusted Web Activity with
package id `net.paxtech.console`. Keep `public/manifest.webmanifest` linked from
the root layout, and keep the signing certificate fingerprint in
`public/.well-known/assetlinks.json` aligned with the APK keystore. Without the
Digital Asset Links file on the existing `https://ws.lakeward.net` deployment,
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
https://ws.lakeward.net
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
