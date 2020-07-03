import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate HOME + config to a temp dir (read lazily per-call by the store).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-acct-'));
process.env.HOME = TMP;
process.env.PIKILOOM_CONFIG = path.join(TMP, 'setting.json');

// Force inline-sealed credentials so the test never touches the OS keychain.
vi.mock('../src/core/secrets/index.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    persistSecret: async (_account: string, plaintext: string) => ({ source: 'inline', sealed: actual.sealInline(plaintext) }),
    forgetSecret: async () => {},
  };
});

// Stub the driver-level usage reads so the snapshot tests never hit the network or the keychain.
const usageMocks = vi.hoisted(() => {
  const mkUsage = (tag: string) => ({
    ok: true, agent: 'claude', source: 'ratelimit-headers', capturedAt: '2026-07-02T00:00:00.000Z',
    status: 'allowed', windows: [{ label: '5h', usedPercent: 10, remainingPercent: 90, resetAt: null, resetAfterSeconds: null, status: 'allowed' }],
    error: null, tag,
  });
  return {
    mkUsage,
    claudeUsageForToken: vi.fn(async (token: string) => mkUsage(`token:${token}`)),
    claudeNativeUsage: vi.fn(async () => mkUsage('native')),
  };
});
vi.mock('../src/agent/drivers/claude.js', () => ({
  claudeUsageForToken: usageMocks.claudeUsageForToken,
  claudeNativeUsage: usageMocks.claudeNativeUsage,
}));

import * as kernel from '../packages/kernel/dist/index.js';
import * as accounts from '../src/agent/accounts.js';

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ } });

describe('kernel account token capability', () => {
  it('maps supported agents to the token env var', () => {
    expect(kernel.accountTokenSupported('claude')).toBe(true);
    expect(kernel.accountTokenSupported('claude-tui')).toBe(true);
    expect(kernel.accountTokenSupported('codex')).toBe(false);
