import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/agent/index.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/agent/index.ts')>();
  return {
    ...actual,
    doStream: vi.fn(),
    listAgents: () => ({
      agents: [
        { agent: 'claude', installed: false, path: null, version: null },
        { agent: 'codex', installed: true, path: '/usr/bin/codex', version: null },
        { agent: 'gemini', installed: false, path: null, version: null },
        { agent: 'hermes', installed: false, path: null, version: null },
      ],
    }),
  };
});

import { doStream } from '../src/agent/index.ts';
import { ensureManagedSession } from '../src/agent/index.ts';
import { Bot } from '../src/bot/bot.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';
import { makeStreamResult } from './support/stream-result.ts';

const envSnapshot = captureEnv(['PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR', 'DEFAULT_AGENT']);

beforeEach(() => {
  restoreEnv(envSnapshot);
  vi.clearAllMocks();
  const tmpConfig = makeTmpDir('bot-unit-config-');
  process.env.PIKILOOM_CONFIG = `${tmpConfig}/setting.json`;
  process.env.PIKILOOM_WORKDIR = makeTmpDir('bot-unit-workdir-');
  process.env.DEFAULT_AGENT = 'codex';
});

afterEach(() => {
  restoreEnv(envSnapshot);
});

describe('Bot.runStream', () => {
  it('manages codex cumulative totals across turns/workdir switches and resumes from a session workdir', async () => {
    delete process.env.DEFAULT_AGENT;

    const defaultBot = new Bot();

    expect(defaultBot.defaultAgent).toBe('codex');
    expect(defaultBot.chat(1).agent).toBe('codex');

    process.env.DEFAULT_AGENT = 'codex';

    const doStreamMock = vi.mocked(doStream);
    doStreamMock
      .mockImplementationOnce(async opts => {
        expect(opts.codexPrevCumulative).toBeUndefined();
        return makeStreamResult('codex', {
          sessionId: 'sess-resume',
          inputTokens: 5000,
          cachedInputTokens: 4000,
          outputTokens: 300,
          codexCumulative: { input: 5000, output: 300, cached: 4000 },
        });
      })
      .mockImplementationOnce(async opts => {
        expect(opts.codexPrevCumulative).toEqual({ input: 5000, output: 300, cached: 4000 });
        return makeStreamResult('codex', {
          sessionId: 'sess-resume',
          message: 'Resumed turn',
          inputTokens: 3300,
          cachedInputTokens: 2500,
          outputTokens: 60,
          codexCumulative: { input: 8300, output: 360, cached: 6500 },
        });
      });

    const bot = new Bot();
    const cs = bot.chat(1);
    cs.agent = 'codex';

    await bot.runStream('start', cs, [], () => {});
    const result = await bot.runStream('continue', cs, [], () => {});

    expect(result.message).toBe('Resumed turn');
    expect(result.inputTokens).toBe(3300);
    expect(result.cachedInputTokens).toBe(2500);
    expect(result.outputTokens).toBe(60);
    expect(cs.codexCumulative).toEqual({ input: 8300, output: 360, cached: 6500 });

    const bot2 = new Bot();
    const cs2 = bot2.chat(1);
    cs2.agent = 'codex';
    cs2.sessionId = 'sess-existing';
    cs2.codexCumulative = { input: 8300, output: 360, cached: 6500 };

    const nextWorkdir = makeTmpDir('bot-unit-next-');
    bot2.switchWorkdir(nextWorkdir);

    expect(cs2.sessionId).toBeNull();
    expect(cs2.codexCumulative).toBeUndefined();

    vi.mocked(doStream).mockReset();
    {
    const doStreamMock = vi.mocked(doStream);
    const bot = new Bot();
    const sessionWorkdir = makeTmpDir('bot-unit-session-workdir-');
    const workspacePath = path.join(sessionWorkdir, '.swarmdeck', 'sessions', 'claude', 'session-1', 'workspace');
    const runtime: any = {
      key: 'claude:session-1',
      workdir: sessionWorkdir,
      agent: 'claude',
      sessionId: 'session-1',
      workspacePath,
      codexCumulative: undefined,
      modelId: null,
      runningTaskIds: new Set<string>(),
