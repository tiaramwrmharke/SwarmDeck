# Integrating a New IM Channel

This guide reflects the current `swarmdeck` source layout, where Telegram, Feishu, and WeChat already share the same `bot/` runtime and only differ in `channels/<name>/`.

## What Already Exists

You do not need to reimplement:

- session state and lifecycle
- agent dispatch and stream orchestration
- live-stream preview
- command data fetching and selection UIs
- session / model / agent / skill selection logic
- MCP-backed file return and `im_ask_user` prompts
- human-in-the-loop prompt state (Codex user-input + `im_ask_user`)

Those pieces live in `bot/` and are consumed by every channel.

## The Layers You Plug Into

```text
cli/main.ts
  -> channels/<name>/bot.ts
       -> bot/commands.ts
       -> bot/command-ui.ts
       -> bot/orchestration.ts          (handleIncomingMessage pipeline)
       -> channels/telegram/live-preview.ts   (channel-agnostic; reuse it)
  -> channels/<name>/channel.ts          (transport)
```

## Files to Add

### 1. `src/channels/<name>/channel.ts`

Implement the transport by extending `Channel` from `src/channels/base.ts`.

Responsibilities:

- connect and authenticate
- receive messages / commands / callbacks
