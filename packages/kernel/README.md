# @swarmdeck/kernel

Turn heterogeneous coding agents (**Claude Code · Codex · Gemini · ACP/Hermes**) into one
**uniform, accumulating session snapshot + a small set of control verbs**, exposed over
**pluggable surfaces** (IM, Web, tunnel, raw terminal). Environmental concerns (storage,
credentials, tools, prompts) are **injected ports** with working defaults.

This is the reusable core that [swarmdeck](https://github.com/xiaotonng/swarmdeck) itself is
built on. Drop it into any project and stand up a "swarmdeck-like" backend in a few lines —
**you never parse a CLI's output or learn each agent's wire format**; you read one
`UniversalSnapshot` and call `prompt / stop / steer / interact`.

```bash
npm i @swarmdeck/kernel
```

- Runtime dep: `ws`. Optional: `node-pty` (only for raw-TUI passthrough). Node ≥ 20, ESM-only.
- TypeScript types ship in the package (`dist/**/*.d.ts`). For an LLM-oriented summary, see [`llms.txt`](./llms.txt).

---

## Mental model

```
上层 (you write):   IM bindings · Web UI · Plugins         ── implement Surface / Plugin
                          ▲ createLoom({ surfaces, plugins, ...ports })
@swarmdeck/kernel:   contracts/  Driver · Surface · LoomIO · Ports
  (one import,      runtime/    SessionRunner · Hub (multi-session) · snapshot accumulation · control verbs
   modular inside)  drivers/    Claude / Codex / Gemini / Hermes / Echo  ← the agent axis (下层)
                    surfaces/   WebSurface (ws host) · CliSurface
                    protocol/   UniversalSnapshot + diff  ← the wire vocabulary
                    ports/      SessionStore · ModelResolver · ToolProvider · ... (+ defaults)
                          ▲ spawns the external `claude` / `codex` / `gemini` CLIs (unchanged)
下层 (unchanged):   the agent binaries, native protocols
```

**IM and Web are not two systems** — both are just `Surface`s over the same `LoomIO`.

### Two rails, same driver registry

| Rail | Driver method | Output | Use for |
|------|---------------|--------|---------|
| **Structured** | `driver.run(input, ctx)` | streamed `UniversalSnapshot` (text, reasoning, tool activity, plan, usage) | IM, Web dashboards, any UI that renders structured turns |
| **Raw PTY** | `driver.tui(input)` | a real full-screen interactive process passed through a PTY | a local terminal app (`swarmdeck code`-style); needs `node-pty` |

---

## Quick start

### 1. One turn through one agent — `runTurn` (the bridge primitive)

The smallest unit. No persistence, no multi-session — just run a turn and get a streamed
snapshot + final result. This is exactly what an existing app maps onto its own UI.

```ts
import { runTurn, ClaudeDriver } from '@swarmdeck/kernel';

const { result, snapshot } = await runTurn(
  new ClaudeDriver(),
  { prompt: 'Summarize package.json in one line', workdir: process.cwd(), effort: 'high' },
  {
    onSnapshot: (s) => {
      // fires on every event — render live:
      //   s.text       accumulated assistant output
      //   s.reasoning  accumulated thinking (when the model/auth exposes it)
      //   s.activity   human-readable execution trail ("Read foo.ts", "Run shell: npm test")
      //   s.toolCalls  structured tool calls [{ name, summary, status }]
      //   s.plan, s.usage, s.artifacts, s.interactions
      process.stdout.write(`\r${s.activity?.split('\n').at(-1) ?? ''}`);
    },
    onSteer: (steer) => { /* call steer('extra prompt') mid-turn */ },
    signal: undefined,  // pass an AbortSignal to stop the turn
  },
);
console.log(result.ok, result.text, result.sessionId);
```

### 2. A full multi-session backend — `createLoom`

Adds persistence, a session hub, per-session queueing, discovery, and surfaces. Every port
has a default, so this runs with zero wiring.

```ts
import { createLoom, ClaudeDriver, CodexDriver, WebSurface } from '@swarmdeck/kernel';

const loom = createLoom({
  drivers: [new ClaudeDriver(), new CodexDriver()],   // 下层 (unchanged binaries)
  surfaces: [new WebSurface({ port: 8787 })],         // 上层 (Web/tunnel; add your IM Surface here)
  defaultAgent: 'claude',
  // optional ports — override any one to swap storage / credentials / tools / prompts:
  // sessionStore, modelResolver, toolProvider, systemPromptBuilder, catalog, interactionHandler
});
