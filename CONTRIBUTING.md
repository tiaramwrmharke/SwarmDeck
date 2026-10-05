# Contributing to swarmdeck

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+ (see `package.json` `engines`)
- At least one agent CLI installed and authenticated: [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), or [`gemini`](https://github.com/google-gemini/gemini-cli)
- A bot token for testing (Telegram, Feishu, or WeChat)

### Setup

```bash
git clone https://github.com/xiaotonng/swarmdeck.git
cd swarmdeck
npm install
npm run build
npm test
```

### Local development

```bash
npm run dev    # starts swarmdeck in --no-daemon mode, logs to ~/.swarmdeck/dev/dev.log
```

This gives you a live-reloading development server with the dashboard at `http://localhost:3939`.

### Running tests

```bash
npm test                                    # all unit tests
npx vitest run test/some-file.unit.test.ts  # single test file
npm run test:watch                          # watch mode
