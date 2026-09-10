# PAX Console 代码结构与接入说明

这份文档给人读，目标是让新加入的人能快速理解：项目为什么这样分层、Cloudflare 本地开发为什么这样接、REST 和 WebSocket 后续应该怎么演进。

如果你改了关键架构、认证链路、目录结构、REST/WebSocket 协议、UI primitives 或 shell 布局，请同时更新本文和 `docs/agent-operating-guide.md`。

## 一句话模型

移动端 composer 的权限按钮限制宽度，完整权限名称保留在菜单和无障碍标签中。运行中 Queue/Stop 保持直接可见，Steer 放在移动端更多菜单（桌面仍保留快捷按钮），未实现的语音按钮不占用手机工具栏。Project 原生选择保留系统交互，但用自定义箭头和明确的深色背景/边框；RunBadge 内部图标与文字保持同行。移动端顶部栏为 44px 最小高度加安全区，刷新入口移至用户菜单。短行内代码作为整体换行，超长内容仍允许断行，避免横向溢出。

```txt
Cloudflare Access 负责入口身份。
PAX Manager 负责用户、节点、agent、session、message 等资源。
Next.js 本地同源 proxy 负责把浏览器请求安全转发给 PAX Manager。
TanStack Query 管服务端数据。
Zustand 管纯前端 UI 状态。
WebSocket runtime 管 live agent tunnel。
```

## E2EE durable transport

新的 encrypted transport 保留 paxd 到 Manager 的可靠 WebSocket，把 PostgreSQL
作为跨实例路由和恢复的 durable truth。Manager 只读取经过 AES-GCM AAD 认证的
最小路由 metadata，不解密 ACP payload：

```txt
Browser --encrypted command/HTTP--> 任意 Manager
        <--encrypted event/SSE---- 任意 Manager
                                      |
                         PostgreSQL command/event + LISTEN/NOTIFY
                                      |
                         持有 agent tunnel 的 Manager
                                      |
                              reliable WebSocket
                                      |
                                    paxd
```

协议实现集中在 `src/features/e2ee/`：

- `envelope.ts` 定义 v1 AES-256-GCM envelope。Root key 为 32 字节，command 和
  event 使用 HKDF-SHA-256 分方向派生；`protocol_version`、`cipher_version`、
  `key_epoch`、`record_id`、`agent_id`、`session_id`、`kind` 作为 AAD。
- `transport.ts` 只发送 opaque command，并用 `Last-Event-ID` 恢复 encrypted
  event SSE；cursor 只在一个 batch 的 frame 全部解密并交给调用方后推进。
  HTTP 结果不确定时必须重发 `prepareEncryptedCommand` 产生的同一个 envelope，
  不能用相同业务 ID 重新加密出不同 nonce/ciphertext。
- `root-key-store.ts` 在浏览器 IndexedDB 中按 agent 保存开发阶段手工共享的
  root key。Settings / Security 提供保存和删除入口，key 不经过 Manager API。

paxd 在解密并接受 `session/prompt` 时按 prompt request 建立稳定 `turn_id`，并在
encrypted event plaintext 中以 `{ turn_id, frames }` 返回；canonical encrypted
history 使用同一个 ID。Console 解密后把该 ID 注入所有 live `SessionEvent`，并将
本地 optimistic `pending-turn:*` 重绑定到真实 turn，使实时内容在运行期间接管该轮
agent projection，durable `turn_done` 到达后再由 history 接管，避免两份重复渲染。

浏览器端接口为：

```txt
POST /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/encrypted-commands
GET  /api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/encrypted-events
```

`agent_sessions.transport` 是 workbench 选择链路的 durable truth，值为
`manager` 或 `e2ee`。第一条 encrypted command 会在同一事务中把对应 session 标成
`e2ee`；Manager 启动时也会根据已有 command、event、canonical encrypted history
回填旧数据。Home 的普通 session rail 同时展示两类会话，E2EE 会话带锁和
`Encrypted` label，点击后仍打开同一个 embedded Session workbench。

Workbench 只能按服务端 session marker 切换，不能因为浏览器恰好保存了某 agent 的
root key 就切换，因为同一个 agent 可以同时拥有普通和 E2EE session。E2EE session
使用 `encrypted-history`、encrypted event SSE 和 encrypted command；浏览器缺 key
时显示 locked notice，绝不能静默回退到 Manager 明文 `/conversation`。当前已支持
history、live frame、prompt 和 cancel；queue、steer、attachment 及 Manager 明文
permission projection 在有对应的 encrypted ACP 语义前保持禁用。`/e2ee` 页面继续
作为诊断入口，不再是访问加密 session 的唯一入口。

Home 新建 composer 提供 `Encrypted` toggle。该值是明确的 session creation
intent，并通过 embedded workbench props 传递，不能靠“浏览器有 key”推断。开启后
按以下顺序执行：

```txt
检查当前 agent root key
  -> 创建 Manager session
  -> encrypted command: session/new
  -> 等待 paxd 的加密 ACP response
  -> Home 接受 session assignment / 保存 Project Target
  -> encrypted command: session/prompt
```

任何 `session/new` 失败都不能提前把 Project Target 当作已成功 native assignment。
关闭 toggle 时仍完整使用原 `/conversation` 创建链路。

## 当前本地开发链路

本地浏览器不要直接访问 `api.lakeward.net` 的业务 REST API。这样容易遇到 CORS、Access cookie 等问题。

当前推荐链路是：

```txt
Browser
  -> https://ws.lakeward.net
  -> Cloudflare Tunnel
  -> http://localhost:3000
  -> Next.js app
```

REST 请求走同源 proxy：

```txt
Browser
  -> https://ws.lakeward.net/api/pax/api/v1/user/self/me
  -> src/app/api/pax/[...path]/route.ts
  -> https://api.lakeward.net/api/v1/user/self/me
```

这样浏览器 REST 只面对 `ws.lakeward.net`，复杂的 Cloudflare Access identity 转发集中在 Next route handler 里。直接 agent tunnel 则使用 `wss://api.lakeward.net`。

## 关键环境变量

本地 `.env.local`：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.lakeward.net
PAX_CF_AUTHORIZATION=<pnpm auth:local 自动写入>
```

含义：

```txt
NEXT_PUBLIC_PAX_API_BASE_URL
  浏览器调用的 API base。默认应该是 /api/pax，不要让浏览器跨域直打 api.lakeward.net。

NEXT_PUBLIC_PAX_USER_SCOPE
  当前用 self，让后端按 Cloudflare Access 身份解析当前用户。

NEXT_PUBLIC_PAX_LOGOUT_URL
  顶栏「Sign out」跳转的地址，默认 /cdn-cgi/access/logout（Cloudflare Access
  的同源登出端点，结束 ws.lakeward.net 的 Access 会话）。仅当 console 由
  其它入口托管时才需要覆盖。

PAX_MANAGER_URL
  Next server-side proxy 的上游 PAX Manager 地址。

NEXT_PUBLIC_PAX_WS_BASE_URL
  可选的浏览器 agent tunnel origin 覆盖；托管默认值为 wss://api.lakeward.net。

PAX_ACCESS_APP_URL
  可选的本地 Cloudflare Access 登录目标。auth:local 依次使用该值、
  PAX_MANAGER_URL、https://api.lakeward.net，并把最终计算值作为
  PAX_MANAGER_URL 写回 .env.local，不会硬编码覆盖显式的本地/替代地址。
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
刷新 token。该脚本针对计算出的 API application URL 登录，并把同一个 URL 写入
`PAX_MANAGER_URL`。注意不要提交真实 token。

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
`.env.local` 改回远端 `https://api.lakeward.net`；它本身不会提供身份。
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
  Home 工作台。左侧是统一的 Project / Session 树：Project 下嵌套其
  primary sessions，未绑定 Project 的 session 放在 Recents；session 仍支持
  在同一个 filter control 中多选 agent、node，并选择 Include archived；
  长选项在弹层宽度内截断显示，完整内容通过 tooltip 保留。
  默认列表不展示 archived session；Session 行可通过现有 PATCH 接口归档或恢复。
  正常选择 session
  会保持 Home 挂载并通过 `/?session_id=...` 在右侧打开 embedded workbench；
  地址栏直接进入时也兼容旧的 `/?sessionId=...`，初始化后会规范化为
  `session_id`，再解析 session 对应的 node/agent 并加载 history；
  包括 Command/Ctrl 点击在内的 Home session 链接都使用同一 URL。Project 创建、改名、调整父级、归档以及 Target CRUD 都位于
  Settings / Projects；Home 只负责选中 Project 和开始工作。Target 绑定 Agent
  和 cwd intent，支持同一
  Project/Agent 下多个不同 cwd、编辑、启用/禁用和唯一 enabled default。
  Home composer 不直接暴露 Target，而是让用户选择可选 Project、Agent 并输入
  Workspace 路径。若已有相同 Project/Agent/cwd 的 enabled Target，则复用并在
  Conversation 请求中携带 `project_target_id`；否则请求只携带
  `primary_project_id` 和 cwd，native session 分配成功后才自动创建 Target。
  后端先创建 native ACP session，成功后才把 Agent、cwd 和
  `primary_project_id` 固化到 PAX Session。
  `primary_project_id` 只表达单一的主要
  启动上下文；未来 secretary agent 给一个 Session 标多个 Project 应使用独立
  多对多 label/association，不复用这个字段。admin 可在右上角用户菜单启用
  `Preview as user`，临时隐藏所有 admin-only 实验入口，以检查公开版本。
  该模式属于 Zustand 客户端 UI 状态。
  Collaboration 当前也属于 admin-only 工作区；普通用户和 `Preview as user` 模式
  的桌面、移动导航都不显示该入口。
  底部 composer 保持 clean session 默认入口，并提供 agent 选择、附件入口和
  tool-call approval 偏好；重名 agent 在 agent selector 中显示为
  `agent @ node`。nodes / agents 的详细列表仍放在 Settings 组的子页里，
  sessions 不再是 sidebar 一级工作区。
  当用户还没有 node 或 agent 时，Home 会展示 node registration 和 Devices
  的 onboarding 入口。移动端 Workspace 输入独占一行，避免被 agent 和审批控件挤压。
  左侧 Session rail 在窗口重新聚焦时立即刷新，并在页面可见期间每 15 秒低频轮询；
  Session 分配和 runtime 完成也会失效 user-scoped session list，使状态、预览、时间和
  排序不会停留在首次加载结果。列表使用独立的 `session-list` query namespace，不能
  用 session resource 的 `sessions` 前缀，避免误刷新 history cursor 并重启 `/events`
  observer。
  手机端在全局 Topbar 下方提供独立的 Session tabs 行，与 Session tools header 和
  composer 分层。点击 tab 直接切换，关闭 tab 提供 Undo，但不会 archive/delete
  Session，也不会 stop/cancel 后台 agent。工作集按用户只在 localStorage 保存有序
  session_id，标题和 run status 仍来自 TanStack Query；同一时间只挂载当前
  SessionWorkbench。Session tools header 在手机端默认折叠为只显示 Session 名称、
  加密状态和运行状态的紧凑行；点击后展开原有 Node / Agent、重命名、runtime actions
  和 side panel 入口，再点击向上箭头收回。该行为由共用 SessionWorkbench 承载，
  因而 Home 内嵌和独立 Session 路由保持一致，桌面端仍始终显示完整 header。
  手机全局 Topbar 同时提供等价于浏览器刷新按钮的 hard reload。
  Android 预览包使用 package id `net.paxtech.console` 的 Bubblewrap TWA；网页 manifest
  位于 `public/manifest.webmanifest`，签名证书指纹位于
  `public/.well-known/assetlinks.json`。两者随现有 `https://ws.lakeward.net` 的正常
  Console 发布上线，不需要第二套部署。Cloudflare Access 必须允许匿名读取
  `/.well-known/assetlinks.json`，Android 才能验证域名并隐藏 Custom Tab 地址栏。

src/components/home/project-rail.tsx
  Project 层级导航和 Project CRUD。服务端 hierarchy 是真相；前端仅构树、排序，
  并在编辑父级时排除自身和 descendants。

src/components/resources/
  Settings 组下的资源页。Devices 聚合 Nodes / Agents，Security 只管理 active
  approval grants（pending approvals 留在 Home Inbox），Developer 聚合 API Keys / Node Registration，
  Diagnostics 承载 Monitor。Inquiries 和 Conversations 属于 Home action/deep-link，
  不再伪装成系统设置。旧资源列表 URL 保留 redirect。

src/components/artifacts/
  timeline publication 与 Session Artifacts 侧栏共用的权限安全 document
  viewer。Source adapter 先把 publication / session artifact 归一为
  ArtifactDocument，builtin renderer registry 再按后端 preview_kind、
  content_type、filename 后缀依次解析 image / pdf / html / markdown / text /
  json / jsonl / csv / download。宿主 shell 统一负责 Preview、Download、
  Open page、Open file、fullscreen 和状态；文本 renderer 有 byte / line /
  record / table 预览预算，HTML 只在 sandbox iframe 中展示。侧栏和 timeline
  保留紧凑预览，同时链接到受 AuthGate 保护的全宽独立页
  /artifacts/publications/[publicationId] 与 /artifacts/files/[artifactId]；
  独立页复用同一 renderer，并自动取得短效 preview URL。

src/components/sessions/
  Session workbench。把 REST 历史消息和 WebSocket live events 合成时间线。
  Header 支持通过 node/agent-scoped session PATCH 内联修改名称。Manager 返回的
  `name` 是最终显示名，`reported_name` 是 paxd 最近上报的原始名称，
  `name_is_custom` 表示用户覆盖是否生效。周期性 session report 不覆盖自定义名称；
  用户选择恢复时发送 `{ "use_reported_name": true }`。成功后同时更新 session
  metadata，并失效 agent session collection 与 user-scoped `session-list`。

  daemon agent connection 的 `report_local_sessions` 默认关闭，可在连接编辑表单中
  明确开启。关闭时 paxd 不上报仅从本地日志扫描出的 session，但仍会上报存在于本机
  ACP route 表中的 manager/Console 创建 session，保证这些 session 的发现和名称同步
  不受影响。

  当同一台 paxd 上有多个 remote identity 指向同一个规范化 Cloud API URL 时，paxd
  会强制采用上述仅 ACP route 上报模式，即使连接配置中的开关仍为开启。原因是共享
  paxl 数据不包含云端账号归属，不能安全地把扫描结果分配给任一账号。

  Session observer 的 `/events` SSE 在浏览器网络错误、无 terminal event 的提前
  断流、以及 408/429/502/503/504 时自动重连。重连保留 history cursor 和当前
  timeline buffer，采用最大 5 秒的指数退避；鉴权错误、非瞬时 API 错误、组件卸载
  或切换 session 时停止重试。

  公开用户的 Session 右侧上下文面板提供 Tool evidence 和只读 Artifacts；
  Artifacts 支持列表、刷新、signed URL 预览和下载，不提供旧的浏览器上传入口。
  Knowledge、未接通的语音输入等实验入口只对 admin 展示，并受
  `Preview as user` 开关控制。

  连续的 thought/progress 与 tool call 达到 2 个时，按原顺序聚合为一个默认折叠的
  work block；单独一个 thought 或 tool call 直接展示。子事件仍在运行时标题只显示
  「工作中」，全部完成后显示「工作过程」，不展示思考/工具数量。pending approval
  仍在外层提示；展开后可查看各段思考和相邻 tool group。普通消息或独立 actionable
  event 会结束当前 work block。时间线 block 使用 8px
  间距；agent 与 user 正文使用 14px 字号、20px 行高，Markdown H1/H2/H3
  分别使用 18px/16px/15px 字号，引用使用 13px 字号；Session 与 Home composer
  桌面输入框和正文一致，使用 14px 字号、20px 行高。小于 640px 的手机布局中，输入和 agent/user 正文统一使用 16px/24px，
  表单控件至少 16px，避免聚焦放大并保留手动缩放；较宽布局不再因带触屏而统一放大。
  Command 建议列表只允许纵向滚动，长名称、描述和提示在 composer 宽度内换行。
  Markdown 段落间距为 6px。
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

  `pax:artifact` 是 Agent publish_artifact 成功接收后的展示替身消息。
  timeline 以 durable history 为准恢复 publication 卡片；如果 live frame 也带着
  同一条 `pax:artifact`，merge 会按同一个 message/part id 去重。卡片内部轮询
  publication state，`queued/uploading` 显示 spinner，`available` 再请求
  `/content/main` 获取 preview/download。

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
  图标 toggle 需要在手机点按后也显示说明时，使用 Button 的 tooltipOnClick；
  同时保留 aria-label 描述动作、aria-pressed 描述状态。
  Button 使用 asChild 且同时带 icon 时，由 primitive 内部的 Radix Slottable
  标记真正承接 props 的单个 React element；调用方仍需提供一个元素（例如 a）作为 child。

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
  Console shell 固定在动态视口内并持有页面级 overflow；内部 pane 必须用 flex
  可用高度，不要再用 100vh 或 min-h-screen 撑开根页面，滚动只留在对应 pane 内。
  手机宽度隐藏 Sidebar，保留 Topbar；Home 默认显示 clean composer，并用左侧抽屉承载 Project / Session rail。
  Sidebar 自身使用安静的 surface 和 compact nav rows，不保留固定的 Current node 区块。
  Sidebar 一级入口保持粗粒度：顶部只有 Home 和 Collaboration；
  其余入口收进钉在侧栏底部的 Settings 展开组。
  Collaboration / Settings 是彼此独立的 disclosure，不是 accordion；多个组可以同时保持展开。
  Settings 展开时在 Sidebar 二级导航承载 Projects、Devices、Security、
  Developer 和 Diagnostics。
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
手机 open-session tabs 的有序 session_id（localStorage 持久化）
```

Open-session tabs 只保存 UI selection id，不复制 Session resource。标题和状态继续
从 TanStack Query 的 user session list 派生。

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

Attachments
  Session composer 通过 /attachments 创建用户附件，浏览器按返回的
  upload.protocol 分派上传：s3_presigned_put 对 ticket URL 直接 PUT 文件并原样
  携带 ticket headers；write-once PUT 返回 412 时视为可能已落盘并继续 complete，
  由 manager 的 HEAD 校验决定最终是否接受，其他非 2xx 仍失败；gcs_resumable 保留
  旧的 initialize + session URL PUT 流程；未知协议在发请求前报错。成功后再调用
  /attachments/{attachment_id}/complete 把状态变成 completed。真正发 prompt 时，
  前端把 attachment_id 放进 /conversation 的 content block；附件本身不绑定 agent。

Artifact publications
  Session timeline 识别 `message_type = "pax:artifact"`，从
  `parts[*].payload_json.publication_id` 或
  `artifact-publication://{publication_id}/main` 里恢复 publication id，随后轮询
  /artifact-publications/{publication_id}，并用
  /artifact-publications/{publication_id}/content/main 获取安全预览或下载地址。
  前端以 publication id 作为卡片 key，不按 artifact id 去重。publication 卡片
  和旧 Session artifact 工具都进入 src/components/artifacts 下的共享
  ArtifactViewerShell；两种 source 只负责取得各自的受控短效 URL。卡片和侧栏
  的 Open page 分别进入 /artifacts/publications/{publication_id}?ref=... 与
  /artifacts/files/{artifact_id}?ref=...，独立页不会产生公开 artifact URL。

Artifacts
  Session Artifacts 面板对所有 session 用户开放只读能力。列表走
  /sessions/{session_id}/artifacts，预览/下载走 artifact content endpoint 返回的
  signed GET URL 或 redirect。普通文件预览由共享 builtin document renderer
  registry 解析；Markdown/text/JSON/JSONL/CSV 只拉取有预算的只读预览，
  image/PDF/HTML 直接消费 signed URL，其中 HTML 必须 sandbox。Console 不再
  展示旧的浏览器 artifact 上传入口。
```

这些 API 仍然走浏览器同源 `/api/pax` proxy；不要从组件直连
`https://api.lakeward.net`。

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
  -> on mobile, default to the clean composer and open Project/Session rail as a left drawer
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
session 排序以 `last_user_message_at`（最近一次被接受的用户 prompt）为准；
assistant streaming、thought 和 tool activity 不得改变列表相对顺序。旧数据依次
fallback 到 `last_message_at` 和 `updated_at`。

Session workbench 的 durable history 使用只依赖 manager session id 的入口：

```txt
GET /api/v1/user/{user_id}/sessions/{session_id}/history
```

PAX Manager 根据当前 principal 和 session row 解析真实 agent，再复用 agent-scoped
storage 查询。前端不能用当前选中的 agent 推断 history owner；旧的带 agent_id
history 路由只用于后端兼容。

现在 active node / active agent 暂时取第一个可用项。等 UI 有 selector 后，再把 selection 接到 Zustand。

## Home 新会话工作位置

Project 与 Agent 独立选择。Workspace 只从当前项目、当前 Agent 的启用绑定中
解析：优先默认项，其次唯一项；多个且无默认时由用户选择。已解析目录折叠为
可编辑的一行，缺少绑定时在输入区展开目录输入；可以从已保存位置菜单显式
切到其他已配置的 Agent，不自动切换执行端。目录草稿及编辑状态按 Project/Agent
组合隔离，切换后不沿用另一组合的路径。绑定加载期间禁止启动项目会话。
首次配置仍在 native session 分配成功后保存，匹配已有绑定时不重复创建。
项目、Agent、目录统一放在 prompt 上方，移除重复的项目大卡及 Clean session 标签。

## 当前 Shell / UI 状态

Console shell：

```txt
ConsoleLayout
  flex 主布局
  固定在动态视口内，页面根节点不滚动
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

本地通过 `ws.lakeward.net` 走 Cloudflare tunnel 时，浏览器或 Cloudflare 可能缓存 `/_next/static/chunks/*`。`next.config.ts` 对 `/_next/:path*` 设置了：

```txt
Cache-Control: no-store, max-age=0
```

这只影响开发期静态 chunk 缓存，不改变 PAX API 的数据缓存策略。

## Cloud Run 部署

生产部署推荐使用 Cloud Run 承载 Dockerized Next.js 服务，Cloudflare 继续负责
`ws.lakeward.net` 的 DNS、HTTPS、Access 和入口防护。

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
PAX_MANAGER_URL=https://api.lakeward.net
```

生产环境不要固定设置 `PAX_CF_AUTHORIZATION`。浏览器应先经过 Cloudflare
Access 访问 `ws.lakeward.net`，Next route handler 再读取请求中的
`CF_Authorization` cookie 并转发给 PAX Manager。
直接 agent tunnel 使用 `wss://api.lakeward.net`，依赖浏览器对 API hostname
有效的 Cloudflare Access session；如需替代 origin，使用
`NEXT_PUBLIC_PAX_WS_BASE_URL` 显式覆盖。

## 当前可交互路由

Sidebar 一级入口是粗粒度工作区（顶部 Home / Collaboration，底部 Settings）。
用户任务使用稳定 canonical route，历史平铺 URL 只负责 redirect：

```txt
/                              Home: Sessions + Inbox
/sessions/new                  New session workbench
/sessions/[sessionId]          Canonical session workbench
/artifacts/publications/[id]       Full-width publication preview; ?ref=main
/artifacts/files/[id]              Full-width session artifact preview; ?ref=main
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
```

`/nodes/[id]` 还提供一个独立的"发送密码/密钥到这个节点"面板
（`NodeSecretChannelPush`，不依赖 `features/e2ee` 的 pairing/session
状态）：浏览器调用 `secret-channel/open` 换取 paxd 现场生成的一次性公钥，用
`features/secret-push/crypto.ts` 里的 WebCrypto（ECDH P-256 + HKDF-SHA256 +
AES-256-GCM，与 `paxd/internal/secretchannel/crypto.go` 字节级兼容）在本地加密一
次，再把密文通过 `secret-channel/push` 转发给 paxd；pax-manager 全程只转发不透
明字节，不解密、不落库。每次点击只 open/push 一次；expired 也可能表示节点重启后
丢失了通道记录，因此不自动重开或重新投递，而是提示用户检查节点后手动重试。
输入在开始发送时清空，发送使用直接 async handler，不把明文或捕获明文的函数放入
TanStack Mutation 缓存。

Settings / Devices / Nodes 的每个在线 node 行提供受确认保护的 paxd
maintenance 操作。Restart 固定发送 `mode: immediate`；打开 Upgrade 弹窗后，前端按
node 上报的 `os/arch` 调用 `GET /api/v1/public/paxd/download` 解析该平台最新的
stable artifact，展示并提交其精确版本；当前版本相同时禁止重复升级。Upgrade 固定
使用 `tag: stable` 和 `mode: immediate`。前端为每次请求生成唯一 `command_id`，并在
ACK 后显示 command id、dispatch status 以及 upgrade 的新 boot 确认状态，便于与
paxd 日志和 heartbeat 对照。

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
Home，只替换为 `/?session_id={session_id}`。

## Conversation run / agent tunnel 状态

Session workbench 的 composer 现在走用户侧 conversation run 入口：

```txt
POST /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/conversation
Accept: text/event-stream
Content-Type: application/json
```

SSE 开始前的失败使用统一 JSON API envelope，包含后端状态码和消息：

```json
{
  "data": null,
  "code": 409,
  "message": "project is archived"
}
```

SSE 开始后的失败通过 `type=error` envelope 返回 `status_code` 与
`message`。前端保留这两个字段为 `ApiError`，并显示为
`HTTP <status>: <message>`。

默认纯文本请求仍可发送：

```json
{ "input": "hello" }
```

New session composer 的主 Send 行为不变，仍要求 prompt。Send 旁的次级
Advanced 菜单提供一次性的 `Create empty session`：它向同一个 endpoint 发送
`{"initialize_only":true}`，可同时携带创建期 cwd、Project context 和 permission
choice。Manager 只执行 `session/new`、live permission 校验/设置与 durable session
绑定，然后依次返回 `type=session`、`type=done`；不发送 `session/prompt`，不创建
turn 或空 user message。成功后 workbench 进入普通 session，并把未发送 draft 从
New-session key 迁移到新 session key。该 action 不适用于 E2EE session，也不是可持久化
的 session mode。
Home 的 `New chat` 第一阶段 composer 也提供相同入口。它通过一次性的
`initialInitializeOnly` 意图挂载 Session Workbench，由 Workbench 复用同一条
initialize-only、permission refresh 和错误恢复链路，避免复制请求或重复创建 session。
明文 session 创建后继续显示相同的 permission selector。修改 choice 时前端调用
session-scoped permission endpoint；Manager 成功执行 live ACP `set_mode` 或
`set_config_option` 并返回有效 session config 后，前端才确认新的选择。

明文 session 的工具栏同时显示 Agent 最近一次上报的 session configuration。Manager
从 `session/new`、`session/set_config_option` response，以及
`session/update` 的 `config_option_update` 中归一化并持久化完整
`configOptions`；legacy `models` 只读保存。Console 每 10 秒读取一次以下 durable
snapshot，因此 agent 在 turn 运行中发出的 model、reasoning 或 boolean fast-mode
更新不依赖重新创建 session：

```txt
GET   /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration
PATCH /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration/options/{config_id}
POST  /api/v1/user/{user_id}/nodes/{node_id}/agents/{agent_id}/sessions/{session_id}/configuration/refresh
```

PATCH body 是 `{"value":"..."}` 或 `{"value":true}`。Manager 只接受 Agent 当前
catalog 已广告的 select value，并保留 permission `mode` 给既有 permission
endpoint。标准 ACP 没有独立的 `list_models` / `get_config_options` 方法；手动
refresh 会重新提交当前 model config value（没有 model 时使用第一个非 permission
config），利用 `session/set_config_option` 必须返回完整 `configOptions` 的协议
语义取得一次 fresh snapshot。这不是严格只读操作，界面 tooltip 必须明确说明。
session-control request 使用独立 admission key，可与同一 session 的 active prompt
并行，但多个 config request 彼此串行。

Hermes 等旧实现只返回 `models.currentModelId/availableModels` 时，Console 可以展示
当前 model 和 model list，但不提供切换或强制刷新，因为旧 `session/set_model`
从未标准化。E2EE session 的 payload 对 Manager 不可见，所以该 selector 和这些 REST
操作保持禁用。ACP client initialize 必须声明
`clientCapabilities.session.configOptions.boolean={}`，否则 Agent 可以合法地省略
boolean fast-mode 配置。

当 composer 带附件时，前端改为发送结构化 content block：

```json
{
  "content": [
    { "type": "text", "text": "请分析这个文件" },
    { "type": "attachment", "attachment_id": "att_..." }
  ]
}
```

续聊时附加 `session_id`。queued turn / steer 仍然只支持文本输入，不带附件。

前端使用 fetch streaming 读取 response body，不能用原生 EventSource
（这个接口是 POST + JSON body）。每条默认 SSE `data:` 是一个 PAX envelope：

```txt
type=session       保存 session_id；新会话 replaceState 到 /?session_id={session_id}
type=turn_started  在可见输出前接管不透明的业务 turn_id
type=acp           取 envelope.frame，保留 turn_id 并走 normalizeTunnelFrame
type=turn_done     durable history 可查询后结束该业务 turn
type=done          只结束本次请求流；不携带 turn_id
type=error         展示错误并结束 streaming state
```

`approval_required` 与 `interrupted` 保留当前业务 `turn_id`。
`permission_required` 只暂停 turn，随后请求级 `done` 不得把它标为完成；permission
resume 复用同一个 turn ID，queued follow-up 使用新的 ID。durable history 的同一
turn 投影都带 `turn_id`，并以 `message_type=turn_done`、`status=complete` marker
结束。timeline 必须把 history、当前窗口拥有的 conversation stream、observer replay
作为三条独立有序流协调，不能按 `createdAt` 重排（observer 重放帧使用客户端接收时间）。
本地 conversation 只接管该 turn 的 agent 输出，同时保留 durable user prompt，并把
该 turn 留在原 history 位置；observer 只在现有 history/conversation 前缀后追加增量，
过滤重放文本，不能删除整轮 history。只有 completion marker 出现在 history 后，
durable history 才完整接管该 turn。
durable history 可能把同一 turn 的全部 `agent_message_chunk` 聚合进第一条 chunk
对应的记录；history normalization 必须把该聚合文本放在该 turn 的工作事件之后、
durable turn boundary 之前。实时流仍按接收顺序展示。

manager 负责代理 ACP initialize / session/new / session/prompt。续聊时必须传
已有且属于当前用户、URL 中 node/agent 下的 `sess_*`，并且后端已有 native id 绑定。

Session 的持久化运行状态只有一个权威来源：REST Session 对象中的
`runtime_status`（`idle` / `running` / `waiting_approval` / `unknown`）。列表、详情、Home、
移动端 activity dot 都只能读取该字段，不能回退到 `status`、`run_status`、ACP
frame、observer 状态或 agent 在线状态。当前窗口明确提交 conversation turn 后，
workbench badge 可以用该窗口拥有的本地状态乐观覆盖为 `running` 或
`waiting_approval`。前端收到 ACP `end_turn`、conversation error 或 Stop ACK 时，
分别立即原地覆盖为 `done`、`error` 或 `cancelled`，不等待旧的 running snapshot
刷新。该本地状态同时负责当前窗口的 composer、stop、queue 和流式交互，但不会写成
或冒充持久化状态。
Session query 仅保留 30 秒低频轮询作为断连兜底。
node-control 断开后的 60 秒 grace 内保留最后一次运行状态；如果仍未重连，Manager
把活跃状态改为 `unknown`，但保留 turn instance id。`unknown` 不能等同于 idle，
workbench 必须继续锁住 composer，直到重连后的全量 snapshot 或显式 reset 完成校准。
E2EE workbench 同样以该服务端状态为准，本地解密流只能覆盖自己拥有的 turn，刷新后
不能用本地初始化的 idle 覆盖服务端 running 或 unknown。

`/conversation` SSE 的可恢复 transport error 不等于 turn error：当前 workbench
保持 `running` 展示，并立即启用 Session `/events` observer 接管，即使 running
snapshot 尚未到达。observer 建连成功后清除连接提示；收到 `turn_done` 或
`no_running_turn` 后把本地展示落为 `done`，并对 history 启动有上限的指数退避
refetch。history 出现对应 turn 的 durable `turn_done` 后立即停止；如果 runtime
turn id 不可用，则等待相对交接前快照新增的 completion marker。只有 conversation
明确返回的业务 error envelope 才是 terminal `error`。

罕见的假活跃状态通过 workbench overflow 菜单执行 compare-and-reset：前端把只读的
`runtime_turn_instance_id` POST 到
`/api/v1/user/{user_id}/agents/{agent_id}/sessions/{session_id}/runtime/reset`。
确认框必须说明该操作只修正展示状态，不会 cancel 或 terminate 底层任务；接受后失效
Session detail、agent Session list 与全局 Session list query。

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
1. 连接 wss://api.lakeward.net/api/v1/user/self/agents/{agent_id}/tunnel
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
agent_message_chunk             -> agent_message, streaming: true
agent_thought_chunk             -> progress, streaming: true
usage_update { used, size }     -> context_usage
final result.usage              -> token_usage
session_info_update             -> run_status
未知或控制类 update -> 忽略，不渲染为 timeline 正文
```

`context_usage` 和 `token_usage` 都是隐藏的 turn metadata，不单独渲染成
timeline 卡片。turn aggregator 保存结束前最后一个 context snapshot 和 final
result 中的本轮 token usage，并在现有 Done / copy / feedback footer 中显示一个
仪表盘图标；hover/focus tooltip 展示 context、compact 前后值和
input/cache/output/reasoning breakdown。带 `_meta.contextCompaction=true` 的 tool update 表示 context
compaction，前一个 context snapshot 与其后的第一个 snapshot 作为 best-effort
before/after 信息。旧记录缺少任一数据时静默省略对应项。

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
running turn，后端发送 `type=no_running_turn` 后关闭；前端停止 observer，并用
有界 history refetch 补齐 conversation/observer 交接窗口。如果有 running turn，
后端先 replay turn-scoped memory
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
  conversation run 首次 prompt 创建，出现在 /?session_id={session_id} URL 中，用来承载产品上下文和历史消息。

ACP/native session
  manager 通过 session/new 创建并绑定到 sess_*，对前端隐藏，用来向 agent runtime 发送 session/prompt。
```

仍待完善：

```txt
更多 ACP session/update 类型覆盖
```

## Cloudflare 接入规则

日常本地开发推荐：

```txt
http://localhost:3000 -> Next.js app -> /api/pax proxy -> api.lakeward.net
```

需要验证真实 Cloudflare Access 入口、cookie forwarding 或浏览器 WebSocket
行为时，再使用 tunnel：

```txt
https://ws.lakeward.net -> Cloudflare Tunnel -> http://localhost:3000
```

Next dev server 需要允许这个 origin：

```ts
// next.config.ts
allowedDevOrigins: ["ws.lakeward.net", "*.console-dev.lakeward.net"];
```

如果从另一台机器通过局域网访问 dev server，启动时通过逗号分隔的
`PAX_ALLOWED_DEV_ORIGINS` 增加允许的 hostname/IP；不要把开发者机器的临时 IP
硬编码到 `next.config.ts`。

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
