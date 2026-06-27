# PAX Console 代码结构与接入说明

这份文档给人读，目标是让新加入的人能快速理解：项目为什么这样分层、Cloudflare 本地开发为什么这样接、REST 和 WebSocket 后续应该怎么演进。

如果你改了关键架构、认证链路、目录结构、REST/WebSocket 协议、UI primitives 或 shell 布局，请同时更新本文和 `docs/agent-operating-guide.md`。

## 一句话模型

```txt
Cloudflare Access 负责入口身份。
PAX Manager 负责用户、节点、agent、session、message 等资源。
Next.js 本地同源 proxy 负责把浏览器请求安全转发给 PAX Manager。
TanStack Query 管服务端数据。
Zustand 管纯前端 UI 状态。
WebSocket runtime 管 live agent tunnel。
```

## 当前本地开发链路

本地浏览器不要直接访问 `app.paxtech.net` 的业务 API。这样容易遇到 CORS、Access cookie、WebSocket Origin 等问题。

当前推荐链路是：

```txt
Browser
  -> https://console.paxtech.net
  -> Cloudflare Tunnel
  -> http://localhost:3000
  -> Next.js app
```

REST 请求走同源 proxy：

```txt
Browser
  -> https://console.paxtech.net/api/pax/api/v1/user/self/me
  -> src/app/api/pax/[...path]/route.ts
  -> https://app.paxtech.net/api/v1/user/self/me
```

这样浏览器只面对 `console.paxtech.net`，复杂的 Cloudflare Access cookie 转发集中在 Next route handler 里。

## 关键环境变量

本地 `.env.local`：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://app.paxtech.net
PAX_CF_AUTHORIZATION=<pnpm auth:local 自动写入>
```

含义：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL
  浏览器调用的 API base。默认应该是 /api/pax，不要让浏览器跨域直打 app.paxtech.net。

NEXT_PUBLIC_PAX_USER_SCOPE
  当前用 self，让后端按 Cloudflare Access 身份解析当前用户。

NEXT_PUBLIC_PAX_LOGOUT_URL
  顶栏「Sign out」跳转的地址，默认 /cdn-cgi/access/logout（Cloudflare Access
  的同源登出端点，结束 console.paxtech.net 的 Access 会话）。仅当 console 由
  其它入口托管时才需要覆盖。

PAX_MANAGER_URL
  Next server-side proxy 的上游 PAX Manager 地址。
```

登出链路：顶栏右上角的用户邮箱是一个下拉触发器（`src/components/shell/topbar.tsx`
配合 `src/components/ui/dropdown-menu.tsx`），点击展开后的「Sign out」会把浏览器
导航到 `LOGOUT_URL`（见 `src/features/api/client.ts`）。登出不经过 `/api/pax`
proxy，由 Cloudflare Access 直接处理，组件不感知 Cloudflare 细节。

如果未来需要无浏览器 cookie 的本地调试，可以增加：

```txt
PAX_CF_AUTHORIZATION=<local-only CF_Authorization value>
```

运行 `pnpm dev` 时会先通过 `cloudflared access` 获取本地 Access token
并写入 `.env.local`，再启动 Next.js。也可以单独运行 `pnpm auth:local`
刷新 token。注意不要提交真实 token。

## 目录结构

```txt
src/app/
  Next.js App Router 入口、页面路由、server route handler。

src/app/api/pax/[...path]/route.ts
  本地同源 REST proxy。Cloudflare/CORS 问题优先在这里收敛，不要散落到组件里。

src/components/
  只放 UI 组件和页面组合。组件可以调用 feature hooks，但不要自己拼后端协议细节。

src/components/ui/
  本地 UI primitives。当前包括 Button、Badge、SearchBox、Tooltip、TruncatedText、MonoId。
  当前只把 Radix Tooltip/Slot 作为底层能力使用，还没有全面引入 shadcn 生成组件。

src/components/home/
  Overview 页面。当前展示 nodes、agents、sessions 的真实 API 数据。

src/components/resources/
  Sidebar tabs 对应的资源列表页。Nodes、Agents、Sessions、Approvals、Monitor、API Keys 都通过这里复用认证、布局和基础数据加载。

src/components/sessions/
  Session workbench。把 REST 历史消息和 WebSocket live events 合成时间线。

src/components/shell/
  Console 外壳：sidebar、topbar、主布局。

src/components/providers/
  全局 providers，比如 TanStack Query。

src/features/api/
  REST API client、resources hooks、query keys、types。

src/features/auth/
  当前用户认证 gate。进入 Console 前先请求 /me。

src/features/runtime/
  Agent tunnel runtime、WebSocket 状态、事件归一化。

src/stores/
  Zustand store，只放纯 UI 状态。
```

UI 约定：

```txt
长 ID / endpoint / file path / API key prefix
  使用 TruncatedText 或 MonoId，hover tooltip 展示完整值。
  卡片中的 node/agent/session id 可用 src/lib/format.ts 的 compactId 缩短显示，完整值放 tooltip。

status / count pill
  使用 Badge 表示需要扫读或行动的状态，例如 connected / running / failed / approval required / revoked / offline。
  普通 metadata、数量、路径、endpoint、resource type 优先用 muted text 或 MonoId，不要都做成 pill。

按钮和搜索框
  优先使用 src/components/ui 下的 Button 和 SearchBox，避免每个页面重新手写尺寸。

整体界面风格
  走 Codex-like dark workbench，而不是通用 dashboard。
  优先使用 split panes、compact rows、timeline、evidence panel。
  避免大 hero、KPI-card grid、每个 section 都套 rounded card、紫/蓝渐变装饰。
  Cards 只用于可选择实体、modal、独立工具或确实需要框住的复杂内容。

Sidebar 折叠
  使用 Zustand 的 sidebarCollapsed，不要放进 URL 或服务端数据。
  ConsoleLayout 使用 flex；Sidebar 自己用 width: 248/76px 控制展开/收起，并带 overflow-hidden。
  Sidebar 自身使用安静的 surface、分隔线式 node context、compact nav rows。
  不要用动态 Tailwind grid-cols-[...] 字符串控制主布局列宽，容易被 dev cache / class 扫描影响。
```

## 服务端数据和 UI 状态边界

TanStack Query 管这些：

```txt
current user
nodes
agents
sessions
messages
mailbox history
teams
team members / invites / agents
friends
envelopes
knowledge capsules / injections
metrics
pagination
refetch
invalidation
```

Zustand 管这些：

```txt
activeNodeId
activeAgentId
activeSessionId
sidebarCollapsed
drawer open/close
composer drafts
local filters
临时 UI selection
```

不要把 nodes、agents、sessions、messages 复制进 Zustand。否则会出现两个 truth source。
同理，teams、friends、envelopes、knowledge capsules/injections 也属于服务端数据，
只通过 TanStack Query 缓存和失效刷新。

## 协作与知识资源

Console 现在把 pax-manager 的协作和知识交接能力接成三个一级入口：

```txt
Teams
  team 列表、成员、team invites、team agents，以及 friends 管理。
  Team invite 前端必须显式提交 member/operator，不依赖后端默认 role。

Envelopes
  类邮箱的收发箱。Envelope 当前承载 knowledge_capsule payload。
  创建 envelope 前需要 accepted friend；accept 后后端会 unpack 成 knowledge capsule。

Knowledge
  knowledge capsules 列表、详情和 archive。
  Session workbench 可从当前 session 创建 capsule，也可把 capsule 注入当前 session。
  注入通过 /sessions/{session_id}/knowledge-injections 创建 system_handoff 消息，
  UI 仍然通过 REST history 和 runtime events 渲染时间线。
```

这些 API 仍然走浏览器同源 `/api/pax` proxy；不要从组件直连
`https://app.paxtech.net`。

## 当前 REST 数据流

首页 overview：

```txt
AuthGate
  -> useCurrentUser()
  -> GET /api/v1/user/self/me
  -> FleetOverview
  -> useNodes(user.user_id)
  -> useNodeAgents(user.user_id, activeNode.node_id)
  -> useAgentSessions(user.user_id, activeNode.node_id, activeAgent.agent_id)
```

现在 active node / active agent 暂时取第一个可用项。等 UI 有 selector 后，再把 selection 接到 Zustand。

## 当前 Shell / UI 状态

Console shell：

```txt
ConsoleLayout
  flex 主布局
  Sidebar 独立控制宽度
  content area flex-1 min-w-0

Sidebar
  expanded width: 248px
  collapsed width: 76px
  collapsed state: useConsoleStore().sidebarCollapsed
  collapsed 时只展示图标，文字通过 Tooltip 访问

Topbar
  使用 Button / SearchBox / TruncatedText，避免按钮和搜索框过宽。
```

本地通过 `console.paxtech.net` 走 Cloudflare tunnel 时，浏览器或 Cloudflare 可能缓存 `/_next/static/chunks/*`。`next.config.ts` 对 `/_next/:path*` 设置了：

```txt
Cache-Control: no-store, max-age=0
```

这只影响开发期静态 chunk 缓存，不改变 PAX API 的数据缓存策略。

## Cloud Run 部署

生产部署推荐使用 Cloud Run 承载 Dockerized Next.js 服务，Cloudflare 继续负责
`console.paxtech.net` 的 DNS、HTTPS、Access 和入口防护。

当前根目录 `Dockerfile` 使用 Next.js standalone output：

```txt
next.config.ts output: "standalone"
pnpm build
node .next/standalone/server.js
PORT=8080
```

Cloud Run 环境变量应保持：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://app.paxtech.net
```

生产环境不要固定设置 `PAX_CF_AUTHORIZATION`。浏览器应先经过 Cloudflare
Access 访问 `console.paxtech.net`，Next route handler 再读取请求中的
`CF_Authorization` cookie 并转发给 PAX Manager。

## 当前可交互路由

Sidebar tabs 已经是实际路由，不再是纯视觉占位：

```txt
/                    Home overview
/nodes               Nodes list
/nodes/[id]          Node detail
/agents              Agents on active node
/agents/[id]         Agent detail, expects nodeId query when opened from list
/sessions            Sessions on active agent
/sessions/[id]       Session workbench
/approvals           Pending approvals and active approval grants
/monitor             PAX Manager health and fleet summary
/settings/api-keys   API key list/create/revoke
/settings/node-registration  Node registration token minting
```

`/settings/api-keys` 已接 `GET/POST/DELETE /api-keys`。新建 key 后只在当前页面展示一次 secret。

`/settings/node-registration` 已接：

```txt
POST /api/v1/user/{user_id}/node-registration-tokens
```

创建成功后只在当前页面展示一次 registration token。

`/nodes/[id]` 和 `/agents/[id]?nodeId=...` 已接：

```txt
GET /api/v1/user/{user_id}/nodes/{node_id}
GET /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}
```

`/monitor` 已接：

```txt
GET /api/v1/health
```

`/approvals` 已接线上新增的 approvals / approval-grants API：

```txt
GET  /api/v1/user/{user_id}/approvals
POST /api/v1/user/{user_id}/approvals/{approval_id}/decision
GET  /api/v1/user/{user_id}/approval-grants
POST /api/v1/user/{user_id}/approval-grants/{grant_id}/revoke
```

Topbar 的 `New session` 已接：

```txt
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions
```

创建成功后会跳转到 `/sessions/{session_id}?nodeId=...&agentId=...`。

## WebSocket / agent tunnel 状态

`src/features/runtime/agent-tunnel-runtime.ts` 现在主要完成：

```txt
connect
disconnect
reconnect
socket status fan-out
ACP initialize / authenticate
ACP session/new
ACP session/prompt
session/update/raw frame -> normalized SessionEvent
agent_message_chunk / agent_thought_chunk -> streaming event merge
```

Session workbench 现在有 composer。发送消息时，组件只调用：

```txt
tunnel.sendUserMessage(paxSessionId, content)
```

组件不要直接知道 ACP JSON-RPC 细节。runtime 内部会：

```txt
1. 连接 wss://app.paxtech.net/api/v1/user/self/agents/{agent_id}/tunnel
2. initialize
3. 如果后端返回 authMethods，则 authenticate
4. 第一次发送前 session/new，得到 ACP/native session id
5. 用 ACP/native session id 调 session/prompt
6. 把 session/update 等通知归一化为 SessionEvent
7. 给每次 prompt 分配 turn-scoped stream id，把流式 chunk 合并成一条持续增长的消息
```

目前已经确认的真实 WebSocket 流式返回形状：

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

对应规则：

```txt
agent_message_chunk -> agent_message, streaming: true
agent_thought_chunk -> progress, streaming: true
usage_update        -> token_usage
session_info_update -> run_status
```

chunk 合并在 `src/features/runtime/merge-session-events.ts`，不是在 React JSX 里做。组件只渲染归一化后的 SessionEvent。

这里有两个 session，不要混淆：

```txt
PAX Manager session
  REST 创建，出现在 /sessions/{session_id} URL 中，用来承载产品上下文和历史消息。

ACP/native session
  WebSocket runtime 通过 session/new 创建，只在 runtime 内部使用，用来向 agent runtime 发送 session/prompt。
```

仍待完善：

```txt
更多 ACP session/update 类型覆盖
中断 / stop 协议
approval event 和 approvals REST inbox 的联动
重连后 REST history refetch 补洞
```

## Cloudflare 接入规则

日常本地开发推荐：

```txt
http://localhost:3000 -> Next.js app -> /api/pax proxy -> app.paxtech.net
```

需要验证真实 Cloudflare Access 入口、cookie forwarding 或浏览器 WebSocket
行为时，再使用 tunnel：

```txt
https://console.paxtech.net -> Cloudflare Tunnel -> http://localhost:3000
```

Next dev server 需要允许这个 origin：

```ts
// next.config.ts
allowedDevOrigins: ["console.paxtech.net", "*.console-dev.paxtech.net"]
```

团队多人本地开发优先使用 `localhost + pnpm dev` 自动刷新本地 token，不要
要求每个成员维护一个 Cloudflare Tunnel。

浏览器侧不要手动设置：

```txt
Cookie: CF_Authorization=...
```

浏览器 WebSocket API 也不能手动设置 Cookie header。需要同源 cookie、后端允许 Origin，或者本地/服务端 WebSocket proxy。

## 改代码时的维护要求

如果你修改这些内容，请同步更新本文：

```txt
API base / proxy / auth 逻辑
Cloudflare Access 或 tunnel 配置
REST endpoint shape
WebSocket / ACP protocol
项目目录结构
TanStack Query / Zustand 边界
本地开发命令或 env
```

agent 也必须同步更新 `docs/agent-operating-guide.md`。
