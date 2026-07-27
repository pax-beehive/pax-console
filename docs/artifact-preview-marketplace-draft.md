# Artifact Preview / Marketplace 草案

更新时间：2026-07-26

## 1. 当前结论

### 1.1 `pax-console` main 状态

已 double check：Artifact publication / attachments 相关能力已经以 PR 形式进了 `main`，不是当前本地分支 tip 的那个 commit 原样进入。

- 当前 `main`：`91da958 Fix slotted link button crash (#67)`
- 已合入的相关 PR：`babefc9 Add attachments and artifact publication UI (#65)`
- 当前工作分支 tip：`6ba060e feat: add attachments and artifact publications`
- 结论：**功能已经在 `main`，但不是同一个 commit hash；当前分支是合入前/并行演进版本。**

### 1.2 `pax-console` 现在的 artifact 预览状态

当前有两条 artifact 预览路径：

1. **Session timeline 的 artifact publication 卡片**
   - 数据来自 `/artifact-publications/{publication_id}`
   - 预览来自 `/artifact-publications/{publication_id}/content/main`
   - 已支持：`image` / `pdf` / `markdown` / `text` / `json` / `download`
   - 问题：UI 较轻，类型支持不统一，缺少更完整的 viewer 壳子

2. **Session Artifacts 侧边栏**
   - 数据来自 `/sessions/{session_id}/artifacts`
   - 预览来自 `/artifacts/{artifact_id}/content/{ref}`
   - 现状基本是 signed URL + `iframe`
   - 问题：偏工具化，不够像一个成型的 artifact viewer

### 1.3 本草案的方向

短期先做：

- **普通文件 preview 做好**
- **统一 timeline 和 side panel 的预览体验**
- **不改权限模型**
- **不做公开 artifact URL**

中长期保留：

- **artifact marketplace / renderer marketplace**
- 第三方通过少量代码 + contract 快速接入新 artifact 类型
- 未来支持 design prototype / deck / live artifact runtime

---

## 2. 产品目标

## 2.1 近端目标（这次要落的）

在 `pax-console` 内提供一个统一的、权限安全的、比当前更漂亮的普通文件预览能力。

最小覆盖：

- image
- pdf
- html
- markdown
- text
- json
- csv
- jsonl
- download-only fallback

## 2.2 中期目标

把 builtin preview 组织成一套 **renderer registry**，即使第一版仍然只有官方内建 renderer，也要让架构上具备未来 marketplace 化的可能。

## 2.3 远期目标

把 artifact 从“文件”升级成“可插拔展示对象”：

- document
- prototype
- deck
- live artifact
- domain-specific report / dashboard / eval artifact

---

## 3. 设计原则

### 3.1 权限优先，不走 Artifact Hub 的公开 URL 模型

`artifact-hub` 当前没有内建权限体系；`pax-console` 必须反过来：

- 预览和下载都继续走现有受控 API
- 仍然依赖当前用户、session、publication 的权限边界
- 不引入“永久公开可访问”的 artifact 页面

### 3.2 先把 artifact 当文件看，但代码结构按可插拔系统设计

当前实现先只做 builtin renderers；但概念上要区分：

- `Artifact Core`：存储、权限、下载、状态、签名 URL
- `Artifact Contract`：这是什么 artifact，具备什么展示能力
- `Artifact Renderer`：具体怎么展示

### 3.3 宿主负责 viewer 壳子，renderer 负责内容区

统一由 `pax-console` 提供：

- 标题栏
- 文件信息
- Preview / Download / Open
- Fullscreen
- Loading / Error / Empty states

具体内容 renderer 负责：

- markdown 阅读器
- json 结构化显示
- csv 表格显示
- html sandbox iframe
- image/pdf 展示

这条原则也是未来做 artifact marketplace 的前提。

---

## 4. `artifact-hub` 调研结论

## 4.1 `artifact-hub` 当前支持的类型

根据 `README.md` 与服务端实现，当前明确支持：

- `.html` / `.htm`
- `.md` / `.markdown`
- `.json`
- `.jsonl`
- `.csv`

不覆盖：

- image
- pdf
- office 文档

这点和 `pax-console` 不同：`pax-console` 现有 publication preview 已经需要 image / pdf，因此我们不能只照抄它的类型集合。

## 4.2 `artifact-hub` 各类型对应 feature

| 类型 | `artifact-hub` 做法 | 关键体验 |
| --- | --- | --- |
| HTML | 原样内容 + CSP sandbox | 安全隔离、保真显示 |
| Markdown | 服务端渲染阅读页 | GFM、Mermaid、KaTeX、代码复制、TOC、Reader 设置 |
| JSON | 服务端渲染结构化页面 | pretty print、高亮、折叠、行号、截断提示 |
| JSONL | 服务端渲染 record 流页面 | record 编号、逐条 pretty、高亮、截断提示 |
| CSV | 服务端渲染表格页面 | sticky 表头、行号、固定首列、横纵 hover 高亮、截断提示 |

## 4.3 `artifact-hub` 的 Markdown reader 体验拆解

它的 Markdown reader 不是简单把 Markdown 转成 HTML，而是一个完整阅读页。关键点：

1. **阅读排版**
   - 居中的 paper-like 阅读卡片
   - warm paper 背景 + 清晰层级
   - 适合长文阅读，不像聊天气泡

2. **目录（TOC）**
   - 自动扫描 `h1-h6`
   - 生成左侧 sticky TOC
   - 滚动时高亮当前位置

3. **代码块增强**
   - 每个代码块有 toolbar
   - 显示语言名
   - 一键复制，复制成功有状态反馈

4. **Mermaid**
   - 找 `language-mermaid`
   - 在前端把代码块替换成图
   - Mermaid 渲染失败时回退到原始代码块

5. **KaTeX**
   - 支持行内 / 块级公式
   - 忽略 `pre` / `code` 等区域

6. **Reader 设置**
   - 可调字体
   - 可调字号
   - 可调行距
   - 设置保存在 `localStorage`

7. **移动端适配**
   - 小屏时自动收起 TOC
   - 阅读卡片变成无边框、满宽、可滚动的移动阅读体验

## 4.4 `artifact-hub` 值得借的不是“公开页”，而是“类型化 viewer”

最值得借的是：

- markdown 不是当纯文本，而是当 reader
- json/jsonl/csv 不是当下载文件，而是当结构化数据阅读页
- html 虽然是 iframe，但有清晰的 sandbox 边界

不该借的是：

- 无权限公开 URL
- 任何人可访问/删除的模型

---

## 5. `pax-console` 这边的落地方案

## 5.1 先只做一类总模式：`document`

当前阶段先不做 prototype/deck/live artifact runtime，只做：

- `preview_mode = document`

在 `document` 下再细分 renderer：

- `builtin:image`
- `builtin:pdf`
- `builtin:html`
- `builtin:markdown`
- `builtin:text`
- `builtin:json`
- `builtin:csv`
- `builtin:jsonl`
- `builtin:download`

## 5.2 统一一个 `ArtifactViewerShell`

无论入口来自 timeline publication 还是 session artifacts side panel，都进入同一个 viewer 壳子。

统一壳子负责：

- title / filename / size / status
- preview actions（Preview / Download / Open）
- fullscreen
- loading / error / empty states
- renderer mount area

这样可以把当前两套体验收敛成一套。

## 5.3 `document` 模式的清晰定义

`document` 模式不是“所有 artifact 的预览总称”，而是一个边界很明确的产品概念：

> **`document` = PAX 内建的、权限安全的、只读的普通文件 viewer。**

它服务的对象是：

- image
- pdf
- html
- markdown
- text
- json
- csv
- jsonl
- 以及无法内联展示但可下载的文件

它**负责**：

- 文件内容预览
- 统一 viewer 壳子
- 加载 / 错误 / 空态
- 下载 / 新标签打开 / fullscreen
- 合理的前端预览裁剪与 fallback

它**不负责**：

- prototype runtime
- 页面跳转 / 多 screen navigation
- host bridge 协议
- live artifact refresh
- comment / inspect / tweaks runtime

这些属于未来的 `prototype` / `deck` / `live_artifact` 模式。

## 5.4 `document` 模式的内部分层

建议把 `document` 模式拆成四层，而不是散落在两个现有入口里分别 hardcode。

### 5.4.1 Source Adapter

先把两种来源统一成同一种内部 view model。

#### 来源 A：artifact publication
- publication 状态来自 `/artifact-publications/{publication_id}`
- preview state / signed URL 来自 `/artifact-publications/{publication_id}/content/main`

#### 来源 B：session artifact
- artifact list 来自 `/sessions/{session_id}/artifacts`
- signed preview URL 来自 `/artifacts/{artifact_id}/content/{ref}`

两者先统一成一个内部对象，例如概念上包含：

- `id`
- `sourceType = publication | session_artifact`
- `title`
- `filename`
- `sizeBytes`
- `contentType`
- `status`
- `previewKind`
- `previewUrl`
- `downloadHref`
- `createdAt`

UI 层不再关心它最初来自 publication 还是 session artifact。

### 5.4.2 Renderer Resolver

统一对象进入 resolver，再决定最终使用哪个 renderer。

建议决策顺序：

1. **先信后端明确给的 `preview_kind`**
   - 如 `image` / `pdf` / `markdown` / `text` / `json` / `download`
2. **再看 `content_type`**
   - `image/*` -> image
   - `application/pdf` -> pdf
   - `text/markdown` -> markdown
   - `application/json` -> json
   - `text/csv` -> csv
   - `application/x-ndjson` / `application/jsonl` -> jsonl
   - `text/html` -> html
   - `text/plain` -> text
3. **最后看 filename 后缀兜底**
   - `.md` -> markdown
   - `.json` -> json
   - `.jsonl` -> jsonl
   - `.csv` -> csv
   - `.html` -> html
   - `.txt` / `.log` -> text
4. **再不行就 `download_only`**

### 5.4.3 Viewer Shell

统一由一个 `ArtifactViewerShell` 负责外壳，不同类型只替换内容区。

Shell 统一负责：

- title / filename / size / status/type badge
- Preview / Download / Open
- fullscreen
- loading / error / empty state
- renderer mount area
- 统一的背景、边距、滚动和高度策略

这意味着：

- markdown 不是自己随便渲一段
- html 不是直接散落一个 iframe
- publication 和 session artifact 不是两套独立 UI

### 5.4.4 Renderer

只有内容区按类型切换：

- `DocumentImageRenderer`
- `DocumentPdfRenderer`
- `DocumentHtmlRenderer`
- `DocumentMarkdownRenderer`
- `DocumentTextRenderer`
- `DocumentJsonRenderer`
- `DocumentJsonlRenderer`
- `DocumentCsvRenderer`
- `DocumentDownloadFallbackRenderer`

## 5.5 `document` 模式的加载策略

不是所有 renderer 都按同一种方式拿数据。

### 5.5.1 URL 型 renderer

适合：
- image
- pdf
- html

策略：
- 直接消费 signed preview URL
- 不把内容文本拉回 React 再二次拼装

### 5.5.2 Text 型 renderer

适合：
- markdown
- text
- json
- jsonl
- csv

策略：
- `fetch(previewUrl).text()`
- 前端做只读渲染

## 5.6 `document` 模式的预览预算（必须有）

`document` 模式是 viewer，不是 IDE。前端预览必须有 budget，避免大文件卡死页面。

建议引入统一的 preview budget 概念：

- 最大预览字节数
- 最大文本行数
- 最大 JSONL records 数
- 最大 CSV 行数 / 列数

超过预算时：

- 当前 renderer 只显示部分内容
- 明确显示“预览已截断”或类似 notice
- 继续提供 Download / Open

这点非常重要。它既能保证第一版实现简单，也能避免为了极端大文件提前引入复杂后端 preview page。

## 5.7 各类型第一版怎么做

### Image

- 直接 `<img>` / `next/image`
- object contain
- 背景板 + fullscreen

### PDF

- 继续走受控 preview URL
- `iframe` 展示
- 提供新标签打开与下载

### HTML

- 继续走受控 preview URL
- `iframe sandbox` 展示
- 不在 console DOM 内直接执行 HTML
- 保留 `Open in new tab`
- 这是 `document` 模式里最强的隔离类型

### Markdown

第一版目标：做成 reader，而不是聊天气泡。

建议借 `artifact-hub` 的几个点，但先控制范围：

**第一批必做：**
- 独立阅读布局（不要复用 chat message 样式）
- 标题层级、表格、引用、列表、代码块优化
- 代码块 copy
- 右上角 fullscreen
- 简单 TOC（至少支持 h2/h3）
- 记住字号 / 行距设置（`localStorage`）

**第二批再做：**
- Mermaid
- KaTeX
- 字体切换
- 更完整的移动 reader 适配

这能快速拿到 70% 的 reader 质感，而且不要求我们先改后端。

### Text

- `pre` + 自动换行/横向滚动策略
- 大小信息与下载入口
- 长文本要有限高 + fullscreen

### JSON

第一版建议：
- pretty print
- 语法高亮
- 行号
- 截断提示

第二版再考虑：
- 折叠节点
- 大文件分段展开

### JSONL

第一版建议：
- 按 record 分块显示
- 每条记录单独 pretty print
- record 编号
- 截断提示

### CSV

第一版建议：
- 渲染成表格
- sticky header
- 行号列
- 横向滚动

第二版再考虑：
- 固定第一列
- 行列 hover 高亮
- 大表截断策略与摘要

### Download-only

- 明确提示“该 artifact 当前仅支持下载”
- 不要让用户看到空白 iframe
- 不支持预览不等于预览失败

---

## 6. 为什么当前阶段优先前端实现

当前需求是“普通文件 preview”，因此优先级应是：

1. 不改权限模型
2. 尽量复用现有 signed preview / download API
3. 快速把 UI 壳子和常见 renderer 做出来

因此第一版倾向：

- HTML / PDF / image：继续靠 signed URL
- Markdown / text / json / jsonl / csv：前端 reader/structured renderer

这不排斥未来加后端 preview page；只是当前阶段没必要先上复杂度。

---

## 7. 为未来 artifact marketplace 预留的最小 contract

虽然这次不实现 marketplace，但这次的 viewer 设计最好天然留出这些概念。

## 7.1 建议保留的字段语义

### `preview_mode`

当前：
- `document`

未来可扩：
- `prototype`
- `deck`
- `live_artifact`
- `media`

### `renderer_id`

当前只用内部值：
- `builtin:markdown`
- `builtin:json`
- `builtin:csv`
- `builtin:html`

未来可扩成第三方：
- `acme:evaluation-report/v1`
- `pax:prototype-runtime/v1`
- `community:notebook/v1`

### `capabilities`

当前只需要：
- `preview`
- `download`
- `fullscreen`

未来可扩：
- `navigation`
- `comment_targets`
- `inspect`
- `refresh`
- `host_bridge`

## 7.2 未来 marketplace 的最小包形态（草案）

```json
{
  "id": "community/csv-table-v1",
  "version": "1.0.0",
  "matches": {
    "preview_mode": ["document"],
    "mime_types": ["text/csv"]
  },
  "capabilities": ["preview", "fullscreen"],
  "entry": {
    "kind": "react_renderer",
    "module": "./renderer.js"
  }
}
```

当前阶段先不开放第三方执行，只把内建 renderer 按这个心智组织起来。

---

## 8. 对设计原型 / Open Design 方向的保留意见

这次不做 prototype runtime，但必须记住：

- `artifact-hub` 解决的是 **document reading**
- `open-design` 解决的是 **runnable design artifact**

两者不是一回事。

未来如果要做你眼红的那种能力，建议在 `preview_mode` 上另开分支：

- `document`：普通文件 viewer
- `prototype`：HTML runtime + host chrome + device frame + navigation
- `deck`：slide chrome + thumbnail rail + keyboard navigation
- `live_artifact`：可刷新、可追踪来源、可带 tweaks / provenance 的运行式 artifact

这意味着这次 viewer 的实现不能把所有东西都硬编码成“文件 iframe”。

---

## 9. 推荐分期

## Phase 1：普通文件 preview MVP

目标：

- 统一 publication card 和 session artifacts side panel 的预览体验
- 上一个正式的 `ArtifactViewerShell`
- 支持 image / pdf / html / markdown / text / json / csv / jsonl / download
- 优先把 Markdown reader 做得像一个 reader

## Phase 2：builtin renderer registry

目标：

- 把当前 renderer 从 if/else 抽成 registry
- 引入 `preview_mode / renderer_id / capabilities` 的内部概念
- 对外仍然是官方内建 renderer

## Phase 3：artifact marketplace

目标：

- 第三方通过 contract + renderer 接入
- 平台仍控制权限、数据、下载、宿主壳子
- 第三方只负责内容 renderer 或 runtime adapter

## Phase 4：prototype runtime

目标：

- 引入 `preview_mode = prototype`
- host-controlled chrome
- navigation / multi-screen / device frame
- 为 comment / inspect / tweak 预留 bridge

---

## 10. 最终建议

当前最合理的路线是：

> **先把普通文件 preview 做漂亮、做统一；但底层抽象按“未来 artifact marketplace”来摆。**

短期借 `artifact-hub`：
- 文档型阅读体验
- Markdown reader
- JSON / JSONL / CSV 结构化预览
- HTML sandbox 思路

中长期借 `open-design`：
- 把 artifact 看成可运行展示对象
- 宿主 chrome 与内容 runtime 分离
- 未来支持 prototype / deck / live artifact

这个顺序能同时满足：

- 现在马上能用
- 不会挡住未来更大的 artifact 平台方向
