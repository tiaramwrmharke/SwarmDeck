// @swarmdeck/kernel — heterogeneous coding agents -> an interaction-friendly,
// accumulating session snapshot + control handle, over pluggable surfaces.
//
//   const loom = createLoom({
//     drivers: [new ClaudeDriver()],                 // 下层 (unchanged)
//     surfaces: [new WebSurface({ port: 8787 })],  // 上层 (IM / Web / tunnel)
//   })
//   await loom.start()
//
// swarmdeck itself is just a consumer of this package.
//
// This barrel IS the public API (pinned by test/api-surface.test.ts). Driver-internal
// parser/settle helpers are exported by their modules for white-box tests but are
// deliberately NOT re-exported here.

export { createLoom, type Loom, type LoomConfig, type TuiLaunchOptions } from './runtime/loom.js';
export { Hub } from './runtime/hub.js';
export { SessionRunner } from './runtime/session-runner.js';
export { runTurn, type RunTurnOptions, type TurnOutcome } from './runtime/turn.js';
export { PtyBridge, ptyAvailable, type PtyExit, type PtyOpenOpts } from './runtime/pty.js';
export { attachTui, type AttachTuiOptions } from './runtime/tui.js';

// Contracts
