import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: execSyncMock,
  };
});

describe('Gemini usage resolution', () => {
  const originalHome = process.env.HOME;
  let homeDir = '';

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T00:00:00Z'));

    execSyncMock.mockReset();
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-gemini-usage-'));
    process.env.HOME = homeDir;
    fs.mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(homeDir, '.gemini', 'oauth_creds.json'), JSON.stringify({
      access_token: 'gemini-token',
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('fetches live quota and caches it, then surfaces an HTTP error when the query fails uncached', async () => {
    {
      execSyncMock.mockReturnValue(JSON.stringify({
        buckets: [
          { modelId: 'gemini-2.5-flash', remainingFraction: 0.75, resetTime: '2026-03-16T00:30:00Z' },
          { modelId: 'gemini-2.5-pro', remainingFraction: 0.7, resetTime: '2026-03-16T01:00:00Z' },
          { modelId: 'gemini-3.1-flash-lite-preview', remainingFraction: 0.4, resetTime: '2026-03-16T00:45:00Z' },
          { modelId: 'gemini-3-pro-preview', remainingFraction: 0.9, resetTime: '2026-03-16T02:00:00Z' },
        ],
      }) + '\n200');

      const { getDriver } = await import('../src/agent/driver.ts');
      const { getUsage } = await import('../src/agent/index.ts');
      const driver = getDriver('gemini');

      const usage = await driver.getUsageLive!({ agent: 'gemini', model: 'gemini-2.5-pro' });

      expect(execSyncMock).toHaveBeenCalledOnce();
      expect(String(execSyncMock.mock.calls[0]?.[0])).toContain('cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota');
      expect(usage.ok).toBe(true);
      expect(usage.source).toBe('quota-api');
      expect(usage.status).toBe('allowed');
      expect(usage.windows.map(window => window.label)).toEqual(['Pro', 'Flash', 'Flash Lite']);
      expect(usage.windows.find(window => window.label === 'Pro')).toMatchObject({
        usedPercent: 30,
        remainingPercent: 70,
        resetAfterSeconds: 3600,
        status: 'allowed',
      });
      expect(usage.windows.find(window => window.label === 'Flash')).toMatchObject({
        usedPercent: 25,
        remainingPercent: 75,
        resetAfterSeconds: 1800,
      });
      expect(usage.windows.find(window => window.label === 'Flash Lite')).toMatchObject({
        usedPercent: 60,
        remainingPercent: 40,
        resetAfterSeconds: 2700,
      });

      const cached = getUsage({ agent: 'gemini' });
      expect(cached.ok).toBe(true);
      expect(cached.windows.map(window => window.label)).toEqual(['Pro', 'Flash', 'Flash Lite']);
    }

    vi.resetModules();
    execSyncMock.mockReset();

    {
      execSyncMock.mockReturnValue(JSON.stringify({ error: { message: 'invalid token' } }) + '\n401');

      const { getDriver } = await import('../src/agent/driver.ts');
      const { getUsage } = await import('../src/agent/index.ts');
      const driver = getDriver('gemini');

      const usage = await driver.getUsageLive!({ agent: 'gemini' });

      expect(usage.ok).toBe(false);
      expect(usage.error).toContain('HTTP 401');
      expect(usage.error).toContain('invalid token');
      expect(getUsage({ agent: 'gemini' }).ok).toBe(false);
    }
  });
});

describe('Gemini session tail', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    vi.resetModules();
    process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-gemini-tail-'));
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('reads prior Gemini conversation turns from native session files', async () => {
    const workdir = '/tmp/swarmdeck';
    const geminiDir = path.join(process.env.HOME!, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(path.join(geminiDir, 'projects.json'), JSON.stringify({
      projects: { [workdir]: 'swarmdeck' },
    }));
