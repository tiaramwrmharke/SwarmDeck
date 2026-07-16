import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { resolveLoomPaths } from '../src/workspace/paths.js';
import {
  discoverClaudeNativeSessions, discoverCodexNativeSessions, discoverGeminiNativeSessions,
  encodeClaudeProjectDir,
} from '../src/drivers/native.js';
import { SessionsManager } from '../src/workspace/sessions.js';
import { SkillsManager } from '../src/workspace/skills.js';
import { McpRegistry } from '../src/workspace/mcp.js';
import type { AgentDriver, NativeSessionInfo } from '../src/contracts/driver.js';
import type { SessionStore, CoreSessionRecord } from '../src/contracts/ports.js';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-ws-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('workspace/paths — the top-level directory', () => {
  it('defaults to .swarmdeck and resolves global + workspace roots', () => {
    const p = resolveLoomPaths({ home: '/home/u' });
    expect(p.stateDirName).toBe('swarmdeck');
    expect(p.dirName).toBe('.swarmdeck');
    expect(p.globalRoot).toBe(path.join('/home/u', '.swarmdeck'));
    expect(p.workspaceRoot('/work/proj')).toBe(path.join('/work/proj', '.swarmdeck'));
    expect(p.sessionsDir('global')).toBe(path.join('/home/u', '.swarmdeck', 'sessions'));
    expect(p.skillsDir('workspace', '/work/proj')).toBe(path.join('/work/proj', '.swarmdeck', 'skills'));
    expect(p.mcpConfigPath('global')).toBe(path.join('/home/u', '.swarmdeck', 'mcp.json'));
    expect(p.agentHome('global')).toBe('/home/u');
    expect(p.agentHome('workspace', '/work/proj')).toBe('/work/proj');
  });

  it('is explicitly configurable (strips a leading dot)', () => {
    expect(resolveLoomPaths({ stateDirName: 'apodex', home: '/h' }).globalRoot).toBe(path.join('/h', '.apodex'));
    expect(resolveLoomPaths({ stateDirName: '.apodex', home: '/h' }).dirName).toBe('.apodex');
  });

  it('createLoom exposes paths (default swarmdeck)', () => {
    const loom = createLoom({ drivers: [new EchoDriver()] });
    expect(loom.paths.stateDirName).toBe('swarmdeck');
    const custom = createLoom({ drivers: [new EchoDriver()], stateDirName: 'apodex' });
    expect(custom.paths.dirName).toBe('.apodex');
  });
});

describe('workspace/native — discovering an agent\'s own sessions', () => {
  it('encodes a claude project dir like claude does', () => {
    expect(encodeClaudeProjectDir('/Users/x/proj-a')).toBe('-Users-x-proj-a');
  });

  it('discovers claude native sessions from ~/.claude/projects', () => {
    const workdir = path.join(tmp, 'proj');
    const projDir = path.join(tmp, '.claude', 'projects', encodeClaudeProjectDir(workdir));
    fs.mkdirSync(projDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'user', isMeta: false, message: { content: 'fix the build' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'done' }] } }),
    ].join('\n');
    fs.writeFileSync(path.join(projDir, 'sess-abc.jsonl'), lines);

    const out = discoverClaudeNativeSessions(workdir, { home: tmp });
    expect(out).toHaveLength(1);
    expect(out[0].sessionId).toBe('sess-abc');
    expect(out[0].title).toBe('fix the build');
    expect(out[0].model).toBe('claude-opus-4-8');
    expect(out[0].preview).toBe('done');
  });

  // A CLI maintenance pass over its own store (claude 2.1.220 backfilled a `last-prompt` index record
  // into every transcript) rewrites every mtime to one instant. Ordering must survive that, or months
  // of history collapse into an arbitrary tie and `limit` cuts the genuinely-recent rows.
  it('clocks claude sessions by their in-file timestamps, not a bulk-rewritten mtime', () => {
    const workdir = path.join(tmp, 'proj');
    const projDir = path.join(tmp, '.claude', 'projects', encodeClaudeProjectDir(workdir));
    fs.mkdirSync(projDir, { recursive: true });
    const transcript = (prompt: string, ts: string) => [
      JSON.stringify({ type: 'user', isMeta: false, message: { content: prompt }, timestamp: ts }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] }, timestamp: ts }),
      // the backfilled index record — carries no timestamp of its own
      JSON.stringify({ type: 'last-prompt', lastPrompt: prompt, sessionId: 'x' }),
    ].join('\n');
    fs.writeFileSync(path.join(projDir, 'old.jsonl'), transcript('ancient e2e run', '2026-06-26T04:48:26.181Z'));
    fs.writeFileSync(path.join(projDir, 'recent.jsonl'), transcript('yesterday real work', '2026-07-24T20:43:00.000Z'));
    // Both files stamped at the same instant by the migration, oldest LAST so a mtime sort inverts them.
    const migration = new Date('2026-07-25T07:55:13.000Z');
    fs.utimesSync(path.join(projDir, 'recent.jsonl'), migration, migration);
    fs.utimesSync(path.join(projDir, 'old.jsonl'), migration, new Date(migration.getTime() + 1000));

    const out = discoverClaudeNativeSessions(workdir, { home: tmp });
