import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => ({ pid: 4321, unref: vi.fn() })),
  };
});

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TelegramBot } from '../src/channels/telegram/bot.ts';
import { TelegramChannel } from '../src/channels/telegram/channel.ts';
import * as agentDriver from '../src/agent/driver.ts';
import type { Agent, StreamResult } from '../src/agent/index.ts';
import { ensureManagedSession } from '../src/agent/index.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';
import { makeStreamResult } from './support/stream-result.ts';
import { createTelegramBotHarness } from './support/telegram-bot-harness.ts';
import { DEFAULT_AGENT_MODELS } from '../src/core/config/runtime-config.ts';

function createBot() {
  return createTelegramBotHarness();
}

const claudeResult = (overrides: Partial<StreamResult> = {}) => makeStreamResult('claude', overrides);
const codexResult = (overrides: Partial<StreamResult> = {}) => makeStreamResult('codex', overrides);

async function renderFinalReply(
  agent: Agent,
  overrides: Partial<StreamResult>,
  messageId = 100,
) {
  const harness = createBot();
  await (harness.bot as any).sendFinalReply(harness.ctx, messageId, agent, makeStreamResult(agent, overrides));
  expect(harness.edits).toHaveLength(1);
  return { ...harness, finalEdit: harness.edits[0] };
}

function previewTexts(edits: Array<{ text: string; opts?: any }>): string[] {
  return edits.slice(0, -1).map(entry => entry.text);
}

function previewText(edits: Array<{ text: string; opts?: any }>): string {
  return previewTexts(edits).join('\n\n');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const envSnapshot = captureEnv(['PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR', 'TELEGRAM_BOT_TOKEN', 'DEFAULT_AGENT', 'PIKILOOM_RESTART_CMD', 'npm_config_yes']);

beforeEach(() => {
  restoreEnv(envSnapshot);
  vi.clearAllMocks();
  const tmpDir = makeTmpDir('bot-tg-unit-');
  process.env.PIKILOOM_CONFIG = `${makeTmpDir('bot-tg-config-')}/setting.json`;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.PIKILOOM_WORKDIR = tmpDir;
  process.env.DEFAULT_AGENT = 'claude';
  delete process.env.PIKILOOM_RESTART_CMD;
  delete process.env.npm_config_yes;
});

describe('TelegramBot', () => {
  it('covers final reply rendering, steer preview, shutdown/restart, status/session UI, and streaming message handling', async () => {
    const failed = await renderFinalReply('claude', {
      ok: false,
      message: 'Should I continue?',
      elapsedS: 17.2,
      inputTokens: 3,
      outputTokens: 178,
      error: 'Claude hit usage limit',
      incomplete: true,
    }, 99);
    expect(failed.finalEdit.text).toContain('Incomplete Response');
    expect(failed.finalEdit.text).toContain('Claude hit usage limit');
    expect(failed.finalEdit.text).toMatch(/✗ claude[\s\S]*17s/);
    expect(failed.finalEdit.opts?.keyboard).toEqual({ inline_keyboard: [] });

    const truncated = await renderFinalReply('claude', {
      message: 'Answer stopped mid-way',
      elapsedS: 9.4,
      inputTokens: 12,
      outputTokens: 999,
      stopReason: 'max_tokens',
      incomplete: true,
    });
    expect(truncated.finalEdit.text).toContain('Output limit reached. Response may be truncated.');

    const summarized = await renderFinalReply('codex', {
      message: 'Build finished.',
      elapsedS: 85,
      inputTokens: 120,
      outputTokens: 18,
      cachedInputTokens: 30,
      contextWindow: 200000,
      contextUsedTokens: 150,
      contextPercent: 25.7,
      activity: 'Ran: /bin/zsh -lc npm run build\nRan: /bin/zsh -lc npm test',
    });
    expect(summarized.finalEdit.text).toMatch(/✓ codex[\s\S]*25\.7% · 1m25s/);
    expect(summarized.finalEdit.text).toContain('<i>commands: 2 done</i>');
    expect(summarized.finalEdit.text).not.toContain('cached:');
    expect(summarized.finalEdit.text).not.toContain('npm run build');
    expect(summarized.finalEdit.text).not.toContain('npm test');

    const harness = createBot();

    const messageIds = await (harness.bot as any).freezeSteerHandoffPreview(
      harness.ctx,
      321,
      { getRenderedPreview: () => '<b>Partial reply</b>' },
    );

    expect(messageIds).toEqual([321]);
    expect(harness.edits).toEqual([
      {
        text: '<b>Partial reply</b>',
        opts: { parseMode: 'HTML', keyboard: { inline_keyboard: [] } },
      },
    ]);

    {
      const bot = new TelegramBot();
      const logLines: string[] = [];
      const onceHandlers = new Map<string, () => void>();
      const onHandlers = new Map<string, () => void>();
      let releaseListen: (() => void) | null = null;

      const connectSpy = vi.spyOn(TelegramChannel.prototype, 'connect').mockResolvedValue({
        id: 1,
        username: 'swarmdeck_test_bot',
        displayName: 'SwarmDeck Test Bot',
      });
      const skipPendingSpy = vi.spyOn(TelegramChannel.prototype, 'skipPendingUpdatesOnNextListen').mockImplementation(() => {});
      const listenSpy = vi.spyOn(TelegramChannel.prototype, 'listen').mockImplementation(async () => {
        await new Promise<void>(resolve => {
          releaseListen = resolve;
        });
      });
      const disconnectSpy = vi.spyOn(TelegramChannel.prototype, 'disconnect').mockImplementation(() => {
        releaseListen?.();
      });
      const onceSpy = vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
        onceHandlers.set(event, handler);
        return process;
      }) as any);
      const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
        onHandlers.set(event, handler);
        return process;
      }) as any);
      const offSpy = vi.spyOn(process, 'off').mockImplementation(((event: string, _handler: () => void) => process) as any);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      const setupMenuSpy = vi.spyOn(bot as any, 'setupMenu').mockResolvedValue(undefined);
      const startupSpy = vi.spyOn(bot as any, 'sendStartupNotice').mockResolvedValue(undefined);
      const startKeepAliveSpy = vi.spyOn(bot as any, 'startKeepAlive').mockImplementation(() => {});
      const stopKeepAliveSpy = vi.spyOn(bot as any, 'stopKeepAlive').mockImplementation(() => {});
      const logSpy = vi.spyOn(bot, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });

      try {
        const runPromise = bot.run();
        await new Promise(resolve => setImmediate(resolve));

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(skipPendingSpy).toHaveBeenCalledTimes(1);
        expect(listenSpy).toHaveBeenCalledTimes(1);
        expect(setupMenuSpy).toHaveBeenCalledTimes(1);
        expect(startupSpy).toHaveBeenCalledTimes(1);
        expect(startKeepAliveSpy).toHaveBeenCalledTimes(1);
        expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));

        onceHandlers.get('SIGINT')?.();
        onceHandlers.get('SIGINT')?.();
        await runPromise;

        expect(disconnectSpy).toHaveBeenCalledTimes(1);
        expect(stopKeepAliveSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(130);
        expect(logLines.filter(line => line === 'SIGINT, shutting down...')).toHaveLength(1);
        expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        expect(offSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      } finally {
        logSpy.mockRestore();
        stopKeepAliveSpy.mockRestore();
        startKeepAliveSpy.mockRestore();
        startupSpy.mockRestore();
        setupMenuSpy.mockRestore();
        exitSpy.mockRestore();
        offSpy.mockRestore();
        onSpy.mockRestore();
        onceSpy.mockRestore();
        disconnectSpy.mockRestore();
        listenSpy.mockRestore();
        skipPendingSpy.mockRestore();
        connectSpy.mockRestore();
      }
    }

    {
      const spawnMock = vi.mocked(spawn);
      const oldArgv = process.argv;
      process.argv = ['node', 'swarmdeck', '-c', 'telegram'];
      const shutdownSpy = vi.spyOn(agentDriver, 'shutdownAllDrivers').mockImplementation(() => {});

      const defaultBot = createBot().bot;
      const defaultExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      const defaultStopKeepAliveSpy = vi.spyOn(defaultBot as any, 'stopKeepAlive').mockImplementation(() => {});
