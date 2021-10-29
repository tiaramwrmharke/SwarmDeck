#!/usr/bin/env npx tsx

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doHermesStream } from '../src/agent/drivers/hermes.ts';
import type { StreamOpts, StreamResult } from '../src/agent/types.ts';

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
  result?: StreamResult;
}

function which(cmd: string): string | null {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function fmt(r: StreamResult, max = 200): string {
  return `ok=${r.ok} session=${r.sessionId || '-'} stop=${r.stopReason || '-'} reply=${JSON.stringify((r.message || '').slice(0, max))} error=${r.error || '-'}`;
}

async function runTurn(
  opts: { prompt: string; sessionId?: string | null; model?: string; effort?: string; workdir: string },
