# Summary Node 成果查看

本 PR 提供 Console 的多摘要成果查看，尚未部署，也未触发真实 Secretary 任务。兼容部署需要先上线对应 Manager API。

## 变更

- 成果列表继续按稳定 summary ID 保留独立条目，同一个整理 session 可以有多份摘要。
- 可选 `node_type: summary`、`node_status: active|empty|stale` 与 `origin_*` 元数据由 Manager 提供；旧响应可省略。空结果只按明确状态标记，不猜测空正文。
- 整理来源 session 只作为展示和搜索分组归属，不代表所有证据、不授予权限，也不在前端复制证据 session 卡片。详情只使用显式真实 session ID 跳转。
- 新增按需分页的 Version history，使用 `GET /secretary/summaries/:summary_id/revisions?limit=20&cursor=...`。响应是 `{items,next_cursor?}`，每行字段同当前摘要列表。选择后仍用 `/search/read` 读取确切 revision，不推断版本连续、不替换旧版本。
- 打开或重新打开历史时核验权限，初始读取失败隐藏旧缓存，续页失败保留已加载条目并提供从头重读；鉴权失败隐藏全部成果。空授权页保留续页入口。
- 进度文案改为 processed，明确无需新增摘要的已提交处理也计完成，重复证据引用只算一次。
- 继续复用已有安全 Markdown、原文读取和返回路径。`full` 不意味着工具日志，Console 不自行生成摘要或更新 board。

## 验证

- 10 个相关文件共 214 个定向测试通过，涵盖多摘要同组、空结果、版本精确导航、分页、重新鉴权和来源返回。
- 覆盖率：新增历史组件 statement 100%，摘要 API 文件 97.05%，合计 98.21%。
- 全量 TypeScript、变更 ESLint、变更 Prettier 与 `git diff --check` 通过。
- `scripts/summary-nodes-browser.mjs` 用真实本地 Next 页面与明确合成 API 检查 1440px/390px 两个视口：同 session 多份成果、按需历史、旧版正文、证据返回、无横向溢出；截图已人工查看。此验证不代表真实 Manager/PG/ES/模型链路端到端验收。
- 已离线安装当前 lockfile 对应依赖，未改 package.json 或 lockfile。
- 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过。build 首轮受 Google 字体网络限制，允许获取现有字体后通过，未改产品字体或配置。
- 全仓 `pnpm format:check` 留下 15 个与 HEAD 完全一致的基线格式问题；本次全部变更文件 Prettier 通过，不改无关文件。
- 全部 Vitest suites：`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --maxWorkers=2 --exclude workers/public-pages/index.test.mjs` 返回 0，164 个文件通过、1 个跳过，1505 个测试通过、2 个既有跳过。允许 loopback 以运行已有 HTTP fixtures。排除的是现有原生 node:test 文件，用 `node --test workers/public-pages/index.test.mjs` 单独验证 3/3 通过。原始无排除的 Vitest 命令会报 No test suite found；未改全局配置或超时。

相关说明已同步到架构、操作和视觉文档。代码均为英文，用户文档为中文。

## 执行与失效状态补充

- 当前摘要可选 stale 状态显示 Awaiting update，不当作空结果，旧版本不套用最新状态。
- Current status 兼容持久执行状态与安全原因，明确结果未知/等待恢复/自动重试暂停；
  不把租约当成原生进程活动证明，不回显新状态的原始执行错误。
- 旧响应、关闭和 agent 不可用的展示保留兼容行为。新增回归覆盖上述优先级与白名单回退。
