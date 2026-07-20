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

### 连接本地 pax-manager

如果要让 console 连本地启动的 `pax-manager`，浏览器侧仍然保持同源
`/api/pax`，只改 Next.js server-side proxy 的上游：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=http://localhost:19879
PAX_CF_AUTHORIZATION=local-dev
```

把 `19879` 换成本地 manager 实际端口。启动 console 时使用：

```bash
PAX_SKIP_AUTH_LOCAL=1 pnpm dev
```

`PAX_SKIP_AUTH_LOCAL=1` 只是不运行 Cloudflare token 自动刷新，避免脚本把
`.env.local` 改回远端 `https://app.paxtech.net`；它本身不会提供身份。
`src/app/api/pax/[...path]/route.ts` 仍会检查 `Cf-Access-Jwt-Assertion`、
浏览器 cookie 或 `PAX_CF_AUTHORIZATION`，所以本地模式也要保留一个
`PAX_CF_AUTHORIZATION`。如果本地 manager 仍校验 Cloudflare JWT，就填真实
token；如果本地 manager 开了 dev auth bypass，`local-dev` 占位值即可。

## 目录结构

```txt
src/app/
  Next.js App Router 入口、页面路由、server route handler。

src/app/api/pax/[...path]/route.ts
  本地同源 REST proxy。Cloudflare/CORS 问题优先在这里收敛，不要散落到组件里。

src/components/
  只放 UI 组件和页面组合。组件可以调用 feature hooks，但不要自己拼后端协议细节。

src/components/ui/
  本地 UI primitives。当前包括 Button、Badge、SearchBox、Tooltip、TruncatedText、MonoId、
  EmptyState、InlineError、SectionTitle、ConfirmDialog。
  当前只把 Radix Tooltip/Slot 作为底层能力使用，还没有全面引入 shadcn 生成组件。

src/components/collaboration/
  Collaboration 工作区页面。teams 和 friends 是独立路由页面
  （/collaboration/teams、/collaboration/friends），teams 页内部按
  team-list-panel / team-detail /
  team-members-section / team-agents-section / team-audit-section 拆分；
  envelopes、knowledge 各自单文件，共享 ui 下的 EmptyState / InlineError /
  SectionTitle。mutation 后的缓存失效统一走 src/features/api/invalidation.ts
  的 useTeamInvalidation / useFriendInvalidation。

src/components/home/
  Home 工作台。左侧提供 Sessions / Inbox 两个 tab；Sessions tab 聚合所有
  可见 agent 的 sessions，支持分别按 agent 和 node 过滤；正常选择 session
  会保持 Home 挂载并通过 `/?sessionId=...` 在右侧打开 embedded workbench，
  独立 `/sessions/{session_id}` 继续作为外部客户端和分享链接的 canonical
  deep link。Inbox tab 聚合 approvals、received envelopes、team invites
  和 inquiry 草稿状态成一个可扫的 action queue；选中一项后显示上下文，
  inquiry 可从空 session 生成 draft、从已有 conversation 总结 draft、
  通过小三角带 note 总结，或对已有 draft 留 comment；右上角关闭 inquiry
  context 后，composer 回到 clean session；archive inquiry 则把它从 queue
  中移除，表示当前用户不处理。当前 fake inquiry 只在 admin 用户或本地 debug
  构建中注入，避免普通生产用户看到演示数据。
  底部 composer 保持 clean session 默认入口，并提供 agent 选择、附件入口和
  tool-call approval 偏好；重名 agent 在 target selector 中显示为
  `agent @ node`。nodes / agents 的详细列表仍放在 Settings 组的子页里，
  sessions 不再是 sidebar 一级工作区。

src/components/resources/
  Settings 组下的资源页。Devices 聚合 Nodes / Agents，Security 只管理 active
  approval grants（pending approvals 留在 Home Inbox），Developer 聚合 API Keys / Node Registration，
  Diagnostics 承载 Monitor。Inquiries 和 Conversations 属于 Home action/deep-link，
  不再伪装成系统设置。旧资源列表 URL 保留 redirect。

src/components/sessions/
  Session workbench。把 REST 历史消息和 WebSocket live events 合成时间线。

  连续的 thought/progress 与 tool call 达到 2 个时，按原顺序聚合为一个默认折叠的
  work block；单独一个 thought 或 tool call 直接展示。子事件仍在运行时标题只显示
  「工作中」，全部完成后显示「工作过程」，不展示思考/工具数量。pending approval
  仍在外层提示；展开后可查看各段思考和相邻 tool group。普通消息或独立 actionable
  event 会结束当前 work block。时间线 block 使用 8px
  间距；agent 与 user 正文使用 14px 字号、20px 行高，Markdown H1/H2/H3
  分别使用 18px/16px/15px 字号，引用使用 13px 字号；Session 与 Home composer
  输入框和正文一致，使用 14px 字号、20px 行高。Markdown 段落间距为 6px。
  agent message 和 work group 不再额外增加纵向 padding，因此文字紧接工作过程时
  仍保持 8px block 间距。

  `pax:invocation` 是 PAX 为 agent-to-agent 调用生成的展示替身消息。
  `pax:invocation_pending` 是同一展示模型的中间态，会先渲染到 timeline；
  后续最终态 `pax:invocation` 通过 `raw_json.replaces_message_ids` 指向 pending
  message id 时，会在 history projection 和 live merge 中替换掉 pending 卡片。
  history 进入时间线前会先按 display contract 投影：把 invocation 渲染在
  `parent_message_id` 的位置，隐藏 `raw_json.replaces_message_ids` 指向的真实
  transcript 消息；如果没有 replaces 列表，则隐藏 parent。live `session/update`
  里新增的 `message_type = "pax:invocation"` / `pax:invocation_pending` frame
  也会归一成同一种 timeline event，并在 merge 阶段替换已经显示过的 parent
  或 pending event。

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
  避免大 hero、KPI-card grid、每个 section 都套 rounded card。
  签名 accent 色为 --accent #5e6ad2（小字/图标用更亮的 --accent-bright #96a0ff），
  只用于小面积交互信号：选中态底色（bg-accent/10，hover 加深到 /15；
  segmented tab 用 bg-accent/15 + accent-bright 文字）、左侧指示条、
  聚焦环/光晕、hover 强调；
  不要把 accent 或渐变用作大面积品牌装饰。body 自带一层极淡的 accent
  径向渐变增加纵深，::selection 使用 accent 色。
  Cards 只用于可选择实体、modal、独立工具或确实需要框住的复杂内容。

Sidebar 折叠
  使用 Zustand 的 sidebarCollapsed，不要放进 URL 或服务端数据。
  ConsoleLayout 使用 flex；Sidebar 自己用 width: 248/76px 控制展开/收起，并带 overflow-hidden。
  手机宽度隐藏 Sidebar，保留 Topbar；Home 默认显示 clean composer，并用左侧抽屉承载 Sessions / Inbox rail。
  Sidebar 自身使用安静的 surface 和 compact nav rows，不保留固定的 Current node 区块。
  Sidebar 一级入口保持粗粒度：顶部只有 Home 和 Collaboration；
  其余入口收进钉在侧栏底部的 Settings 展开组。
  Collaboration / Settings 是彼此独立的 disclosure，不是 accordion；多个组可以同时保持展开。
  Settings 展开时在 Sidebar 二级导航承载 Nodes、Agents、Inquiries、Conversations、
  Approvals、Monitor、API Keys、Node Registration。
  Collaboration 展开时在 Sidebar 二级导航承载 Teams、Friends、Envelopes、Knowledge。
  Team invites 属于 Teams 页面里的 team action queue，不作为 Collaboration 并列二级入口。
  不要把这些全局二级 tabs 放进具体页面 header 或页面组件内部。
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
同理，teams、friends、envelopes、knowledge capsules/injections、session artifacts
也属于服务端数据，只通过 TanStack Query 缓存和失效刷新。

## 协作与知识资源

Console 现在把 pax-manager 的协作和知识交接能力放在 Collaboration 一级入口下：

```txt
Teams
  /collaboration/teams 独立页面：team 列表、成员、team invites、team agents 和 audit。
  Team invite 前端必须显式提交 member/operator，不依赖后端默认 role。

Friends
  /collaboration/friends 独立页面：friends 的创建、接受、alias、remove、block。

Envelopes
  类邮箱的收发箱。Envelope 当前承载 knowledge_capsule payload。
  创建 envelope 前需要 accepted friend；accept 后后端会 unpack 成 knowledge capsule。

Knowledge
  knowledge capsules 列表、详情和 archive。
  Session workbench 可从当前 session 创建 capsule，也可把 capsule 注入当前 session。
  注入通过 /sessions/{session_id}/knowledge-injections 创建 system_handoff 消息，
  UI 仍然通过 REST history 和 runtime events 渲染时间线。

Artifacts
  Session workbench 通过 /artifact-uploads 创建上传票据，浏览器拿 GCS signed
  URL 直接 PUT 文件，再调用 complete 生成 session artifact。列表走
  /sessions/{session_id}/artifacts，预览/下载走 artifact content endpoint 返回的
  signed GET URL 或 redirect。文件内容不要经由 Next /api/pax proxy 中转上传。
```

这些 API 仍然走浏览器同源 `/api/pax` proxy；不要从组件直连
`https://app.paxtech.net`。

## 当前 REST 数据流

Home 工作台：

```txt
AuthGate
  -> useCurrentUser()
  -> GET /api/v1/user/self/me
  -> FleetOverview
  -> useNodes(user.user_id)
  -> listAgents(user.user_id)
  -> listUserSessions(user.user_id, page_size=20, page_num=1, optional comma-separated agent_id/node_id)
  -> scroll left rail to fetch the next session page
  -> support agent and node filtering, render embedded SessionWorkbench when selected
  -> on mobile, default to the clean composer and open Sessions/Inbox as a left drawer
  -> useApprovals(user.user_id)
  -> useEnvelopes(user.user_id, direction=received, status=pending)
  -> useTeamInvites(user.user_id)
```

Sessions redirect fallback：

```txt
AuthGate
  -> useCurrentUser()
  -> useNodes(user.user_id)
  -> listAgents(user.user_id)
  -> Home 通过 GET /api/v1/user/{user_id}/sessions 分页解析 session row
  -> 根据返回的 node_id / agent_id 关联 node/agent label
```

`GET /api/v1/user/{user_id}/sessions` 是 owner 级扁平 sessions list，支持
`page_size` / `page_num` pagination；`agent_id` 和 `node_id` 都可以传
comma-separated 多 id。Home 默认只请求 20 条，滚动左侧 Sessions rail 时再加载
下一页，避免一次性渲染 900+ sessions。

Session workbench 的 durable history 使用只依赖 manager session id 的入口：

```txt
GET /api/v1/user/{user_id}/sessions/{session_id}/history
```

PAX Manager 根据当前 principal 和 session row 解析真实 agent，再复用 agent-scoped
storage 查询。前端不能用当前选中的 agent 推断 history owner；旧的带 agent_id
history 路由只用于后端兼容。

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

Sidebar 一级入口是粗粒度工作区（顶部 Home / Collaboration，底部 Settings）。
用户任务使用稳定 canonical route，历史平铺 URL 只负责 redirect：

```txt
/                              Home: Sessions + Inbox
/sessions/new                  New session workbench
/sessions/[sessionId]          Canonical session workbench
/inquiries                     Home deep-link / agent inquiry composer
/conversations                 Home deep-link / conversation index
/conversations/[id]            Conversation detail
/collaboration/teams           Teams
/collaboration/friends         Friends
/collaboration/envelopes       Envelopes
/collaboration/knowledge       Knowledge capsules
/settings/devices              Nodes; ?view=agents selects Agents
/settings/security             Active approval grants
/settings/developer            API keys; ?view=node-registration selects registration
/settings/diagnostics          Manager health + fleet summary
/nodes/[id]                    Node detail deep-link
/agents/[id]?nodeId=...        Agent detail deep-link
```

Legacy `/nodes`、`/agents`、`/approvals`、`/monitor`、`/teams`、`/friends`、
`/envelopes`、`/knowledge`、`/settings/api-keys`、`/settings/node-registration`
都 redirect 到上面的 canonical route；这一层兼容不需要后端参与。

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

`/nodes/[id]` 也提供 paxd agent control 验证面板，接入：

```txt
GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/status
GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/harnesses
POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/harnesses/discover
GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections
POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections
PATCH  /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}
POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}/stop
POST   /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}/restart
DELETE /api/v1/user/{user_id}/nodes/{node_id}/daemon/agent-connections/{connection_id}
GET    /api/v1/user/{user_id}/nodes/{node_id}/daemon/commands/{command_id}
```

control tunnel 同一时刻只允许一组 query request/response，因此面板按
status → harnesses → agent connections 串行加载。mutation 收到 ACK 后保存
`command_id`，然后每秒查询 agent connections；generation、restart nonce 和
runtime phase 收敛后停止轮询并刷新 agent 列表。command 的 `received` 只表示
paxd 已接收请求，不作为运行完成状态。

agent connection 创建和编辑支持 `desired_slots`（范围 1–16），新建默认值为
`2`；connection 列表展示的是期望 slot 数，不代表当前已 running 的 slot 数。
停止后的 connection 显示 Start 按钮，通过 PATCH `desired_state: "running"`
重新启用，并等待新的 generation 收敛到 running。

面板的 `Discover` 按钮以 `{ "probe": true }` 请求 paxd 重新探测本机 harness，
并用 discover 结果更新 harness inventory 后刷新 connection 列表。

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

`/inquiries` 已接 agent-to-agent inquiry 相关 API：

```txt
GET  /api/v1/user/{user_id}/agent-owner-info?agent_id=...
GET  /api/v1/user/{user_id}/representative-agents?runtime_agent_id=...
POST /api/v1/user/{user_id}/representative-agents
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/inquiries
GET  /api/v1/user/{user_id}/conversations/{conversation_id}/messages
```

Home 的 clean composer 不直接创建后端 session。提交后在 Home 右侧打开
embedded Session workbench：

```txt
/
```

用户发送第一条 prompt 时，Session workbench 通过新的 conversation run
入口创建真实 manager session，并在收到 `type=session` 后把 URL 保持在
Home，只替换为 `/?sessionId={session_id}`。

## Conversation run / agent tunnel 状态

Session workbench 的 composer 现在走用户侧 conversation run 入口：

```txt
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/conversation
Accept: text/event-stream
Content-Type: application/json
```

请求体第一版只暴露：

```json
{ "input": "hello" }
```

续聊时附加：

```json
{ "input": "continue", "session_id": "sess_xxx" }
```

前端使用 fetch streaming 读取 response body，不能用原生 EventSource
（这个接口是 POST + JSON body）。每条默认 SSE `data:` 是一个 PAX envelope：

```txt
type=session  保存 session_id；新会话 replaceState 到 /?sessionId={session_id}
type=acp      取 envelope.frame，继续走 normalizeTunnelFrame / timeline
type=done     结束本次 streaming state
type=error    展示错误并结束 streaming state
```

manager 负责代理 ACP initialize / session/new / session/prompt。续聊时必须传
已有且属于当前用户、URL 中 node/agent 下的 `sess_*`，并且后端已有 native id 绑定。

`src/features/runtime/agent-tunnel-runtime.ts` 仍保留直接 ACP tunnel runtime，
主要用于旧路径和调试。正常 Session workbench 发送 prompt 应使用
`src/features/runtime/use-conversation-run.ts`。

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

旧 direct tunnel composer 发送消息时，组件只调用：

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
未知或控制类 update -> 忽略，不渲染为 timeline 正文
```

ACP permission prompt 不是 `session/update`，而是 agent 发给 client 的
JSON-RPC request：

```txt
method: session/request_permission
params.sessionId
params.toolCall
params.options[]，每个 option 使用 optionId / name / kind
```

manager-side conversation stream 会先发 `approval_required`，再发
`interrupted`，其中 `reason=permission_required`。Session workbench 会把
这个中断展示成 permission card。用户点击决策后，前端先调用：

```txt
POST /api/v1/user/{user_id}/approvals/{approval_id}/decision
```

固定 `decision_option` 为：

```txt
deny
allow_once
allow_for_this_agent
allow_for_this_node
allow_always_on_all_agents
```

前端不要传 `resume_reason`，也不要用 `native_id` resume；`native_id` 是底层
ACP permission request id，由后端内部使用。如果 conversation event 里的
`approval.options` 暂时包含 `allow_for_this_session` 或
`allow_always_on_this_node` 这类旧名字，workbench 仍只按上面的 decision API
allowlist 提交。

decision 成功后，workbench 会重新打开当前 conversation stream，并发送：

```json
{
  "session_id": "sess_*",
  "resume": { "approval_id": "appr_*" }
}
```

PAX Manager 负责把已决定的 approval 转回原始 ACP permission request 的
JSON-RPC response。

当前 turn 正在运行时，Session workbench 底部 composer 的提交按钮不再直接
发新的 conversation run，而是调用：

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/queue
```

请求体为 `{ "input": "..." }`，并带 `Idempotency-Key`。后端对每个 active
session 保留一个可替换的 queued draft；当前 prompt 返回终态 response 后，
由后端 turn sequencer 发送 queued prompt，不依赖浏览器当前 conversation
stream 继续打开。

运行中也可以点击 steer 按钮：

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/steer
```

请求体同样为 `{ "input": "..." }`。语义是 manager-side stop + queue：
先向 ACP tunnel runtime 发 `session/cancel` notification，再等当前 prompt
返回终态 response 后由后端发送新的 queued prompt。现有 `/conversation`
SSE 不是 queued turn 的执行 owner；即使页面关闭，只要 manager 进程和 ACP
tunnel 还活着，queued dispatch 也会继续。前端通过独立 observer 补后台
queued turn 或第二窗口的 live 展示：

```txt
GET /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/events?after_message_id=<message_id>
```

独立 `/sessions/{session_id}` 页面会先在分页的 flat sessions 列表里定位该
session，并以返回的 `node_id`、`agent_id` 作为 queue 和 observer 请求的
权威上下文；查询完成前不能回退到第一个 agent。

这个 endpoint 的语义是观察该 session 当前正在 running 的 turn。如果没有
running turn，后端发送 `type=no_running_turn` 后关闭；前端停止 observer 并
refetch history。如果有 running turn，后端先 replay turn-scoped memory
buffer，再接上 live stream。`after_message_id` 是 REST history 里的全局
`HistoryMessage.message_id`，这里只作为当前 turn buffer 的 trim hint；如果
buffer 里找不到，后端发送 `type=buffer_miss`，跳过 replay，但继续发送后续
live event。正常 live payload 是 `type=acp`，`frame` 形状与 `/conversation`
一致，前端继续走 `normalizeTunnelFrame`。turn 终态时发送 `type=turn_done`
并关闭 observer。

stop 按钮调用：

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/turn/stop
```

请求体为 `{ "reason": "user_requested" }`。stop 只请求取消当前 turn，不会
自动发送新 prompt。

chunk 合并在 `src/features/runtime/merge-session-events.ts`，不是在 React JSX 里做。组件只渲染归一化后的 SessionEvent。

这里有两个 session，不要混淆：

```txt
PAX Manager session
  conversation run 首次 prompt 创建，出现在 /?sessionId={session_id} URL 中，用来承载产品上下文和历史消息。

ACP/native session
  manager 通过 session/new 创建并绑定到 sess_*，对前端隐藏，用来向 agent runtime 发送 session/prompt。
```

仍待完善：

```txt
更多 ACP session/update 类型覆盖
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
allowedDevOrigins: ["console.paxtech.net", "*.console-dev.paxtech.net"];
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
