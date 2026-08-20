<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# PAX Console Agent Memory

Before making changes, read:

```txt
docs/agent-operating-guide.md
docs/architecture.zh.md
docs/pax-console-design.md
```

Project facts:

```txt
Project root              /Users/jiahangzhang/code-base/project/pax-console
Local browser hostname    https://ws.lakeward.net
PAX Manager upstream      https://api.lakeward.net
Browser WebSocket         wss://api.lakeward.net
Browser API base          /api/pax
REST proxy                src/app/api/pax/[...path]/route.ts
Human architecture doc    docs/architecture.zh.md
Agent operating guide     docs/agent-operating-guide.md
```

Hard rules:

- Do not make browser REST calls directly to `https://api.lakeward.net` for normal app behavior. Use same-origin `/api/pax`.
- Keep Cloudflare Access and cookie forwarding inside the Next server route handler.
- Keep server data in TanStack Query and client-only UI state in Zustand.
- Keep ACP JSON-RPC isolated in `src/features/runtime/agent-tunnel-runtime.ts`; React components should call runtime methods, not build raw WebSocket frames.
- Normalize ACP `session/update` frames in `src/features/runtime/normalize-tunnel-frame.ts` and merge streaming chunks in `src/features/runtime/merge-session-events.ts`; do not parse raw `agent_message_chunk` payloads inside React components.
- Do not confuse PAX Manager sessions with ACP/native sessions. PAX sessions belong to REST/URLs/history; ACP sessions are created by `session/new` inside the runtime.
- Use `src/components/ui` primitives for buttons, badges, search, tooltip-backed truncation, and monospace IDs. Do not scatter one-off button/search/status-pill/long-ID Tailwind patterns.
- Sidebar collapse is `useConsoleStore().sidebarCollapsed`; keep shell layout flex-based with explicit sidebar width, not dynamic Tailwind grid columns.
- If you change auth, proxy, API, WebSocket, state ownership, setup, or directory structure, update both:

```txt
docs/architecture.zh.md
docs/agent-operating-guide.md
```

If a change does not require documentation updates, say so explicitly in the final response.
