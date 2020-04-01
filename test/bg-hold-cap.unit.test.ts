import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeDriver, runTurn } from '../packages/kernel/dist/index.js';
// White-box settle heuristics live at the module path, off the public barrel.
import {
  trackClaudeBackgroundTask,
  claudeTurnHasAgentBackground, claudeBgAgentHoldCapMs, claudeBgHoldRecheckMs,
} from '../packages/kernel/dist/drivers/claude.js';
import { composeKernelFinalPresentation } from '../src/agent/kernel-bridge.js';

// Regression 2026-07-06 ("停止不再继续生成"): a research turn with 4 background Explore
// sub-agents hit the 10-minute background hold cap MID-FLIGHT — 22s after its last
// tool_result, while wake-ups were still being processed — and settled 'background'.
// The graceful close then killed the still-running agents, and the bridge showed nothing
// because the turn had narration text. Three fixes under test here:
//   1. sub-agent-backed holds use the (much longer) agent hold cap;
//   2. a cap firing while events still flow defers instead of cutting a working turn;
//   3. a 'background' settle WITH narration appends a visible note (incomplete=true).

const BG_ENV = [
  'PIKILOOM_CLAUDE_BG_HOLD_MS',
  'PIKILOOM_CLAUDE_BG_AGENT_HOLD_MS',
  'PIKILOOM_CLAUDE_BG_SETTLE_QUIET_MS',
  'PIKILOOM_CLAUDE_BG_HOLD_RECHECK_MS',
  'PIKILOOM_CLAUDE_TRUNCATED_RECOVERY',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of BG_ENV) snap[k] = process.env[k];
  return snap;
}
function restoreEnv(snap: Record<string, string | undefined>) {
