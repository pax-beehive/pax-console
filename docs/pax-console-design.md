# PAX Console Design

## Purpose

PAX Console is a fleet control plane and agent workbench for managing nodes, agents, sessions, mailbox messages, and live agent interaction.

The product should feel like a developer-grade console, not a generic admin dashboard. The interface should be dark, compact, fast, observable, interruptible, and built around real work sessions.

The core product idea:

```txt
REST provides truth.
WebSocket provides liveness.
The UI renders normalized agent events.
Cloudflare Access owns identity.
PAX Manager owns permissions and resources.
```

## Fixed Technology Stack

This stack is the project baseline and should not change unless explicitly reopened.

```txt
Framework        Next.js App Router
Language         TypeScript
UI Layer         React
Styling          Tailwind CSS + CSS variables
Component Base   shadcn/ui + Radix UI
Icons            lucide-react
Server State     TanStack Query
Client State     Zustand
Request Helper   ahooks useRequest, limited to local/action requests
Forms            React Hook Form + Zod
Tables           TanStack Table
Virtualization   TanStack Virtual
Charts           Recharts
Animation        Motion, only for subtle UI transitions
Testing          Vitest + React Testing Library + Playwright
Lint/Format      ESLint + Prettier
Package Manager  pnpm
```

Current implementation note: the project currently uses local primitives in `src/components/ui` on top of Radix where needed. `Tooltip` uses Radix Tooltip, `Button` uses Radix Slot for composition, and `Badge` / `SearchBox` / `TruncatedText` / `MonoId` are local wrappers. Use `compactId` from `src/lib/format.ts` when node, agent, and session ids should be recognizable but not visually dominant. Do not replace these with ad hoc Tailwind copies; if shadcn components are introduced later, adapt these primitives deliberately.

### Library Boundaries

TanStack Query owns server state:

```txt
nodes
agents
sessions
messages
mailbox history
metrics
pagination
cache
refetch
invalidation
```

Zustand owns client UI state:

```txt
activeNodeId
activeAgentId
activeSessionId
sidebarCollapsed
drawer state
composer drafts
local filters
tunnel connection display state
```

ahooks `useRequest` is allowed for local or action-style requests:

```txt
create session
send message
stop session
interrupt run
create API key
revoke API key
create node registration token
one-off export
debounced local search
small local polling
```

Do not use ahooks as a second global API cache. Shared API data belongs in TanStack Query.

## Visual Direction

The visual design follows the existing prototype:

```txt
Tone             dark console, restrained, dense
References       Linear, Vercel Dashboard, Raycast, modern devtools
Layout           sidebar + topbar + workbench content
Component size   compact
Radius           mostly 4 / 6 / 8 / 12px
Color            black canvas, layered dark surfaces, indigo accent
Typography       Inter/SF style sans, JetBrains/SF Mono for technical text
```

Design tokens should be implemented as CSS variables first, then exposed through Tailwind.

Initial token shape:

```css
:root {
  --primary: #5e6ad2;
  --primary-hover: #828fff;
  --ink: #f7f8f8;
  --ink-muted: #d0d6e0;
  --ink-subtle: #8a8f98;
  --ink-tertiary: #62666d;
  --canvas: #010102;
  --surface-1: #0f1011;
  --surface-2: #141516;
  --surface-3: #18191a;
  --hairline: #23252a;
  --hairline-strong: #34343a;
  --success: #27a644;
}
```

## Product Information Architecture

```txt
PAX Console
+-- Home
|   +-- current user overview
|   +-- node health summary
|   +-- agent activity summary
|   +-- recent sessions
+-- Nodes
|   +-- node list
|   +-- node detail
|   +-- paxd status
|   +-- system metadata
|   +-- registration tokens
+-- Agents
|   +-- agent list
|   +-- agent detail
|   +-- capabilities
|   +-- sessions
|   +-- bootstrap agent
+-- Sessions
|   +-- session list
|   +-- live agent conversation
|   +-- tool calls
|   +-- file changes
|   +-- token usage
|   +-- run status
+-- Monitor
|   +-- mailbox timeline
|   +-- tool/message events
|   +-- token/cost metrics
|   +-- latency/error views
|   +-- node/agent heartbeat
+-- Settings
    +-- API keys
    +-- node registration
```

## Routes

Recommended Next.js App Router layout:

```txt
src/app/
  layout.tsx
  (console)/
    layout.tsx
    page.tsx
    nodes/
      page.tsx
      [nodeId]/
        page.tsx
    agents/
      page.tsx
      [agentId]/
        page.tsx
    sessions/
      page.tsx
      [sessionId]/
        page.tsx
    monitor/
      page.tsx
    settings/
      api-keys/
        page.tsx
      node-registration/
        page.tsx
```

The console layout owns:

```txt
sidebar
topbar
global search
node selector
new session action
current user menu
active websocket/tunnel indicators
```

Current shell implementation:

```txt
ConsoleLayout
  flex layout
  sidebar width is owned by Sidebar, not by parent grid columns

Sidebar
  expanded: 248px
  collapsed: 76px
  state: useConsoleStore().sidebarCollapsed
  collapsed labels are hidden visually but available through Tooltip

Topbar
  compact Button/SearchBox/TruncatedText primitives
```

Avoid dynamic Tailwind `grid-cols-[...]` strings for shell collapse behavior. The sidebar uses explicit width because local development through `console.paxtech.net` and Turbopack can otherwise make stale chunk/class behavior hard to diagnose.

## Existing API Model

The current OpenAPI file already defines the main domain:

```txt
User
UserAPIKey
Node
Agent
AgentSession
MailboxMessage
TokenUsage
FileChange
AgentApproval
ApprovalOption
```

Important API groups:

```txt
System
GET /api/v1/health

User
GET    /api/v1/user/{user_id}/me
GET    /api/v1/user/{user_id}/api-keys
POST   /api/v1/user/{user_id}/api-keys
DELETE /api/v1/user/{user_id}/api-keys/{key_id}
POST   /api/v1/user/{user_id}/node-registration-tokens

Approvals
GET  /api/v1/user/{user_id}/approvals
GET  /api/v1/user/{user_id}/approvals/{approval_id}
POST /api/v1/user/{user_id}/approvals/{approval_id}/decision
GET  /api/v1/user/{user_id}/approval-grants
POST /api/v1/user/{user_id}/approval-grants/{grant_id}/revoke

Fleet
GET  /api/v1/user/{user_id}/nodes
GET  /api/v1/user/{user_id}/nodes/{node_id}
GET  /api/v1/user/{user_id}/nodes/{node_id}/agents
POST /api/v1/user/{user_id}/nodes/{node_id}/agents
GET  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}

Sessions
GET  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions
GET  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}
GET  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/messages
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/messages

WebSocket
GET /api/v1/user/self/agents/{agent_id}/tunnel
```

Current implemented frontend coverage:

```txt
Implemented
- Auth check through GET /me.
- Fleet overview through nodes, agents, sessions.
- Session detail history through session messages.
- New session through POST /sessions.
- API key list/create/revoke.
- Approval list, decision, grant list, grant revoke.
- Session workbench composer through ACP WebSocket `session/prompt`.
- ACP WebSocket startup through initialize, optional authenticate, and lazy session/new.
- Node detail through GET /nodes/{node_id}.
- Agent detail through GET /nodes/{node_id}/agents/{agent_id}.
- Node registration token creation.
- Health status on Monitor through GET /health.
- Local UI primitives for buttons, search, tooltip-backed truncation, and monospace IDs.
- Collapsible sidebar tabs with icon-only collapsed mode.

Still pending
- Exact ACP session/update event hardening.
- Interrupt/stop over ACP WebSocket.
- Richer monitor timeline beyond health/fleet counters.
- Full shadcn component adoption, if the project later wants generated shadcn components instead of local primitives.
```

Prefer `self` for browser-facing calls when supported:

```txt
/api/v1/user/self/me
/api/v1/user/self/nodes
/api/v1/user/self/agents/{agent_id}/tunnel
```

### API Concern

The current OpenAPI includes request bodies for several `GET` endpoints. Browser fetch and generated clients can behave poorly with GET bodies. The frontend should prefer path/query params. If backend behavior requires GET bodies temporarily, isolate the workaround in `api/client.ts` and do not leak it into components.

## Authentication Design

Authentication is owned by Cloudflare Access.

The frontend does not store or manually handle the Cloudflare token.

```txt
Cloudflare Access
  sets CF_Authorization cookie

Browser REST requests
  use credentials: "include"

Browser WebSocket handshakes
  automatically include same-domain cookies

PAX Manager
  validates Cloudflare Access identity
  maps identity to PAX user
  enforces resource permissions
```

### Important Browser Constraint

Browser WebSocket clients cannot manually set a `Cookie` header.

Do not design code that tries to do this:

```ts
new WebSocket(url, {
  headers: {
    Cookie: "CF_Authorization=xxx",
  },
});
```

The correct browser design is:

```ts
new WebSocket(
  `wss://app.paxtech.net/api/v1/user/self/agents/${agentId}/tunnel`
);
```

The browser will include valid same-domain cookies during the WebSocket handshake.

### Auth Boot Flow

```txt
1. App loads.
2. Frontend calls GET /api/v1/user/self/me with credentials included.
3. If 200, render console.
4. If 401 or 403, render sign-in state or redirect to Cloudflare Access login.
5. After login, Cloudflare returns to app.paxtech.net.
6. REST and WebSocket calls now carry CF_Authorization automatically.
```

### REST Client

All REST calls should go through one client.

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthError();
  }

  const body = await response.json();

  if (!response.ok || body.code >= 400) {
    throw new ApiError(body.message ?? "Request failed", body);
  }

  return body.data as T;
}
```

## WebSocket Design

The browser-facing tunnel endpoint:

```txt
wss://app.paxtech.net/api/v1/user/self/agents/{agent_id}/tunnel
```

This should be wrapped by an agent runtime. Components must not directly create or parse tunnel frames.

```txt
AgentTunnelRuntime
+-- connect(agentId)
+-- disconnect()
+-- initialize ACP JSON-RPC
+-- authenticate when initialize returns authMethods
+-- create ACP/native session lazily with session/new
+-- sendUserMessage(paxSessionId, content) through session/prompt
+-- subscribe(listener)
+-- reconnect with backoff
+-- normalize session/update/raw frames into UI events
```

The runtime deliberately keeps two session concepts separate:

```txt
PAX Manager session
  REST-created product session used by URLs, REST message history, and timeline context.

ACP/native session
  WebSocket-created runtime session returned by session/new and used for session/prompt.
```

### Runtime States

```ts
type TunnelStatus =
  | "idle"
  | "connecting"
  | "initializing"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";
```

Connection state can be shown in the UI, but the raw socket object should remain outside React component state.

### Reconnect Policy

```txt
Reconnect on abnormal close.
Use exponential backoff with jitter.
Stop retrying on auth failure.
After reconnect, refetch REST message history to fill gaps.
Display reconnecting state in the session header.
Never drop the existing visible transcript during reconnect.
```

## Agent Event Model

The UI should not render raw ACP JSON-RPC frames. It should render normalized session events.

```ts
export type SessionEvent =
  | {
      type: "user_message";
      id: string;
      sessionId: string;
      content: string;
      createdAt: string;
    }
  | {
      type: "agent_message";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      createdAt: string;
    }
  | {
      type: "progress";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      createdAt: string;
    }
  | {
      type: "tool_call";
      id: string;
      sessionId: string;
      name: string;
      status: "queued" | "running" | "done" | "error";
      input?: unknown;
      output?: unknown;
      durationMs?: number;
      createdAt: string;
    }
  | {
      type: "file_change";
      id: string;
      sessionId: string;
      path: string;
      tool?: string;
      oldContent?: string;
      newContent?: string;
      createdAt: string;
    }
  | {
      type: "run_status";
      id: string;
      sessionId: string;
      status: "idle" | "running" | "waiting_approval" | "done" | "error";
      createdAt: string;
    }
  | {
      type: "token_usage";
      id: string;
      sessionId: string;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      createdAt: string;
    };
```

### Mapping from Current API

`MailboxMessage` already contains most fields needed to build the event timeline.

```txt
MailboxMessage.message        -> message content
MailboxMessage.message_type   -> event/message kind
MailboxMessage.direction      -> user/agent direction
MailboxMessage.status         -> run/message status
MailboxMessage.events         -> structured progress/tool events
MailboxMessage.payload        -> command-specific data
MailboxMessage.file_changes   -> file_change events
MailboxMessage.token_usage    -> token_usage events
MailboxMessage.error          -> error state
MailboxMessage.result         -> final result
MailboxMessage.turn_id        -> turn grouping
MailboxMessage.response_id    -> response grouping
MailboxMessage.parent_message_id -> threading
```

Create two normalizers:

```txt
normalizeMailboxMessage(message) -> SessionEvent[]
normalizeTunnelFrame(frame)      -> SessionEvent[]
mergeEvents(events)             -> append turn-scoped streaming chunks
```

Both return the same UI event type.

Observed ACP streaming frames use this shape:

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

Current mapping:

```txt
params.update.sessionUpdate = agent_message_chunk -> agent_message, streaming
params.update.sessionUpdate = agent_thought_chunk -> progress, streaming
params.update.sessionUpdate = usage_update        -> token_usage
params.update.sessionUpdate = session_info_update -> run_status
```

The runtime assigns a turn-scoped stream id at `sendUserMessage` time. Chunks for the same turn share an id and `mergeEvents` appends their text. This prevents the workstream from rendering one card per token and prevents future prompts in the same PAX session from appending to the previous turn.

## Session Experience

The session page is the product center.

Recommended layout:

```txt
+--------------------------------------------------------------+
| Topbar: node, agent, search, new session, tunnel status       |
+--------------+-------------------------------+---------------+
| Session list | Workstream                    | Context drawer|
|              | - user messages               | - node         |
|              | - agent messages              | - agent        |
|              | - progress                    | - model        |
|              | - tool calls                  | - token usage  |
|              | - file changes                | - file changes |
|              | - run status                  | - raw metadata |
|              |                               |                |
|              | Composer                      |                |
+--------------+-------------------------------+---------------+
```

### Session Load Flow

```txt
1. User opens /sessions/{sessionId}.
2. Query session detail from REST.
3. Query historical session messages from REST.
4. Normalize mailbox messages into session events.
5. Connect agent tunnel for that session's agent.
6. Append live normalized events from WebSocket.
7. On reconnect, refetch REST messages and merge by stable event/message id.
```

### Composer Behavior

The composer sends user instructions into the active session.

```txt
Enter           insert newline or send depending preference
Cmd/Ctrl Enter  send
Stop            stop or interrupt active run
Attach logs     future file/log reference action
Reference tool  future tool-call quote action
```

The composer draft belongs in Zustand, keyed by session id.

## State and Cache Design

### Query Keys

Use stable query key factories.

```ts
export const queryKeys = {
  me: () => ["me"] as const,
  nodes: () => ["nodes"] as const,
  node: (nodeId: string) => ["nodes", nodeId] as const,
  agents: (nodeId: string) => ["nodes", nodeId, "agents"] as const,
  agent: (nodeId: string, agentId: string) =>
    ["nodes", nodeId, "agents", agentId] as const,
  sessions: (nodeId: string, agentId: string) =>
    ["nodes", nodeId, "agents", agentId, "sessions"] as const,
  session: (nodeId: string, agentId: string, sessionId: string) =>
    ["nodes", nodeId, "agents", agentId, "sessions", sessionId] as const,
  sessionMessages: (nodeId: string, agentId: string, sessionId: string) =>
    ["nodes", nodeId, "agents", agentId, "sessions", sessionId, "messages"] as const,
};
```

### Zustand Console Store

```ts
type ConsoleStore = {
  activeNodeId?: string;
  activeAgentId?: string;
  activeSessionId?: string;
  sidebarCollapsed: boolean;
  contextDrawerOpen: boolean;
  composerDrafts: Record<string, string>;
  setActiveNode: (nodeId: string) => void;
  setActiveAgent: (agentId: string) => void;
  setActiveSession: (sessionId: string) => void;
  setComposerDraft: (sessionId: string, value: string) => void;
};
```

Server entities do not belong in Zustand unless they are temporary optimistic UI state.

## Component Architecture

```txt
src/components/
  shell/
    console-layout.tsx
    sidebar.tsx
    topbar.tsx
    node-selector.tsx
    user-menu.tsx
  sessions/
    session-list.tsx
    session-workstream.tsx
    composer.tsx
    event-card.tsx
    message-card.tsx
    progress-event.tsx
    tool-call-card.tsx
    file-change-card.tsx
    token-usage-card.tsx
    session-context-drawer.tsx
  nodes/
    node-card.tsx
    node-detail.tsx
    node-registration-dialog.tsx
  agents/
    agent-card.tsx
    agent-detail.tsx
    capability-list.tsx
  monitor/
    metric-strip.tsx
    mailbox-table.tsx
    event-timeline.tsx
  settings/
    api-key-table.tsx
    create-api-key-dialog.tsx
  ui/
    shadcn components
```

Use shadcn/Radix for:

```txt
Dialog
Drawer/Sheet
DropdownMenu
Popover
Tooltip
Tabs
Select
Switch
Checkbox
Command
ScrollArea
Table primitives where useful
```

Use TanStack Table for complex tables.

Use TanStack Virtual for long session/event/message lists.

## Runtime Module Architecture

```txt
src/features/runtime/
  agent-tunnel-runtime.ts
  tunnel-url.ts
  normalize-tunnel-frame.ts
  normalize-mailbox-message.ts
  merge-session-events.ts
  session-events.ts
  use-agent-tunnel.ts
```

The runtime should be framework-light. React hooks can wrap it, but the core tunnel code should not depend on component internals.

Recommended hook:

```ts
function useAgentTunnel(agentId?: string) {
  return {
    error,
    events,
    status,
    sendUserMessage,
  };
}
```

`interrupt` and `stop` are not implemented yet because the backend ACP method names are not confirmed in the current OpenAPI/runtime contract. Keep those as future runtime methods instead of wiring guessed protocol calls into React components.

## Local Development

Production should be same-domain:

```txt
https://app.paxtech.net
wss://app.paxtech.net/api/v1/user/self/agents/{agent_id}/tunnel
```

Local development needs a deliberate strategy because Cloudflare Access cookies belong to `app.paxtech.net`.

Recommended modes:

```txt
Mode A: develop against deployed staging app domain.
Mode B: Next.js dev proxy forwards REST and WebSocket to app.paxtech.net.
Mode C: local backend bypasses Cloudflare only in a controlled dev environment.
```

Do not copy `CF_Authorization` into frontend source, localStorage, Zustand, or `.env.local`.

If a dev proxy needs Cloudflare service credentials, keep them server-side only.

When developing through `https://console.paxtech.net`, Next static dev chunks are served through Cloudflare as well. `next.config.ts` sets `Cache-Control: no-store, max-age=0` for `/_next/:path*` so UI shell changes such as sidebar collapse do not get stuck behind stale chunk caching.

## Security Principles

```txt
Do not store CF_Authorization in frontend state.
Do not expose nodeBearer tokens to browser code.
Do not connect browser UI to node-authenticated endpoints.
Use user/self endpoints for browser calls.
Validate user ownership on every manager endpoint.
Treat file changes and tool output as sensitive.
Avoid rendering raw HTML from agent output.
Escape logs and markdown by default.
Keep raw tunnel frames behind developer/debug affordances.
```

## Error Handling

REST errors:

```txt
401/403      auth state, sign-in prompt
404          missing node/agent/session empty state
409          conflict banner, refetch affected query
5xx          retry affordance and incident-style copy
network      offline/retry state
```

WebSocket errors:

```txt
auth failure       stop reconnect, ask user to sign in
agent unavailable  show tunnel not connected
abnormal close     reconnect with backoff
stale heartbeat    mark reconnecting
parse error        log raw frame in debug, keep session alive
```

## MVP Build Order

1. Project scaffold with fixed stack.
2. Theme tokens and console shell.
3. Cloudflare Access auth check using `/api/v1/user/self/me`.
4. Node list and node detail.
5. Agent list and agent detail.
6. Session list and REST-backed message history.
7. New session creation with `POST /sessions`.
8. API key list/create/revoke.
9. Approval inbox and grant revocation.
10. Composer with ACP WebSocket session/prompt.
11. WebSocket tunnel runtime with initialize/authenticate/session/new.
12. Normalize tunnel frames into session events.
13. Tool call, progress, file change, and token usage event cards.
14. Monitor page with mailbox/message timeline.
15. Settings for node registration tokens.
16. Playwright smoke tests for auth shell, session view, and tunnel reconnect display.

## Non-Goals for the First Version

```txt
No marketing landing page.
No generic enterprise dashboard theme.
No direct Ant Design/MUI dependency.
No raw WebSocket logic in React components.
No second global cache through ahooks.
No browser access to nodeBearer endpoints.
No storing Cloudflare authorization in frontend code.
```

## Working Summary

PAX Console should be built as a real-time agent workbench over a fleet control plane.

The user should see what the agent is doing, understand why it is doing it, interrupt it naturally, and recover state after refresh or reconnect.

The durable model is REST. The live model is WebSocket. The product model is a normalized event timeline.
