# Architecture

`swarmdeck` is a layered, open Agent orchestrator. Four conceptual layers — terminals, agents, models, tools — sit on top of cross-cutting infrastructure. This document covers the design principles and extension recipes; the full source tree is in [CLAUDE.md](CLAUDE.md).

## Layered Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  cli/            CLI entry point, terminal setup            │
│  dashboard/      Web server, API routes, runtime singleton  │
├─────────────────────────────────────────────────────────────┤
│  channels/       Per-IM transport + bot orchestration       │
├─────────────────────────────────────────────────────────────┤
│  bot/            Shared bot runtime, commands, streaming    │
├─────────────────────────────────────────────────────────────┤
│  agent/          Agent drivers, sessions, MCP tools, CLI    │
├─────────────────────────────────────────────────────────────┤
│  catalog/        Data-only extension manifests              │
│  core/           Constants, logging, config, utilities      │
└─────────────────────────────────────────────────────────────┘
```

Imports flow strictly downward. `core/` and `catalog/` import from nothing inside `src/`. No layer imports from a layer above it. This keeps the lower layers testable in isolation and prevents circular dependencies.

## Current Capabilities

- **Channels:** Telegram, Feishu, WeChat, Slack, Discord, DingTalk, WeCom
- **Agent drivers:** Claude Code (`claude`, `claude-tui`), Codex, Gemini, Hermes (via ACP)
- **Project skills:** `.swarmdeck/skills/*/SKILL.md` plus legacy `.claude/commands/*.md` compatibility
- **Session-scoped MCP tools:** `im_list_files`, `im_send_file`, `im_ask_user`
- **Browser automation:** managed Chromium via `@playwright/mcp`, supervised by `browser-supervisor.ts`
- **macOS desktop automation:** built-in Peekaboo MCP — Accessibility API + ScreenCaptureKit
- **Dashboard:** Hono server + React SPA at `http://localhost:3939`

## Main Message Flow

```text
Incoming IM message
  → channels/*/channel.ts normalizes text / files / context
  → channels/*/bot.ts resolves command vs free text
