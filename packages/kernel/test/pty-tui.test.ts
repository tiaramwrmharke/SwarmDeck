import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PtyBridge, ptyAvailable } from '../src/runtime/pty.js';
import { createLoom } from '../src/runtime/loom.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult, TuiInput, TuiSpec } from '../src/contracts/driver.js';

// A fake interactive "agent": prints a banner, echoes input, exits on 'Q'. Stands in for
// the real claude/codex TUI so the passthrough mechanics are tested hermetically.
const FAKE = `
process.stdout.write('TUI-READY\\n');
process.stdin.on('data', (d) => {
  const s = d.toString();
  if (s.includes('Q')) { process.stdout.write('BYE\\n'); setTimeout(() => process.exit(0), 10); return; }
  process.stdout.write('GOT:' + JSON.stringify(s) + '\\n');
});
`;

class FakeTuiDriver implements AgentDriver {
  readonly id = 'fake';
  readonly capabilities = { tui: true };
  constructor(private readonly script: string) {}
  async run(_i: AgentTurnInput, _c: DriverContext): Promise<DriverResult> { return { ok: false, text: '', error: 'tui-only' }; }
  tui(input: TuiInput): TuiSpec { return { command: process.execPath, args: [this.script], cwd: input.workdir, env: input.env }; }
}

const waitForData = async (get: () => string, needle: string, ms = 5000) => {
  const t0 = Date.now();
  while (!get().includes(needle)) { if (Date.now() - t0 > ms) throw new Error(`timeout waiting for "${needle}" — got: ${get().slice(0, 200)}`); await new Promise(r => setTimeout(r, 10)); }
};
