import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TelegramChannel } from '../src/channels/telegram/channel.ts';
import { makeTmpDir } from './support/env.ts';

function createTestChannel(overrides: Record<string, any> = {}) {
  const tmpDir = makeTmpDir('tg-test-');
  const ch = new TelegramChannel({ token: 'test-token', workdir: tmpDir, ...overrides });

  const apiCalls: { method: string; payload: any }[] = [];
  let msgIdCounter = 100;

  (ch as any).api = vi.fn(async (method: string, payload?: any) => {
    apiCalls.push({ method, payload });
    if (method === 'getMe') {
      return { ok: true, result: { id: 42, username: 'test_bot', first_name: 'TestBot' } };
    }
    if (method === 'sendMessage') {
      return { ok: true, result: { message_id: msgIdCounter++ } };
    }
    if (method === 'sendMessageDraft') {
      return { ok: true, result: true };
    }
    if (method === 'editMessageText') {
      return { ok: true, result: {} };
    }
    if (method === 'deleteMessage') {
      return { ok: true, result: true };
    }
    if (method === 'answerCallbackQuery') {
      return { ok: true, result: true };
    }
    if (method === 'sendChatAction') {
      return { ok: true, result: true };
    }
    if (method === 'setMyCommands') {
      return { ok: true, result: true };
    }
    if (method === 'getUpdates') {
      return { ok: true, result: [] };
    }
    if (method === 'getFile') {
      return { ok: true, result: { file_path: 'photos/test.jpg' } };
    }
    return { ok: true, result: {} };
  });

  return { ch, apiCalls, tmpDir };
}

async function feedUpdate(ch: any, update: any) {
  await (ch as any)._dispatch(update);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TelegramChannel', () => {
  it('fetches bot info, reports errors, sends and edits messages, routes files, and dispatches updates', async () => {
    {
      const { ch, apiCalls } = createTestChannel();
      const bot = await ch.connect();

      expect(bot.id).toBe(42);
      expect(bot.username).toBe('test_bot');
      expect(bot.displayName).toBe('TestBot');
      expect(apiCalls[0].method).toBe('getMe');
    }

    {
      const conflict = createTestChannel();
      const onError = vi.fn();
      (conflict.ch as any).api = vi.fn(async (method: string, payload?: any) => {
        if (method === 'getUpdates') {
          throw new Error('Telegram polling conflict: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running');
        }
        return { ok: true, result: payload ?? {} };
      });
      conflict.ch.onError(onError);
      await conflict.ch.listen();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]?.message).toContain('Telegram polling conflict:');

      const fetchFail = new TelegramChannel({ token: 'test-token', workdir: makeTmpDir('tg-test-') });
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.telegram.org'), {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname: 'api.telegram.org',
      });
      const fetchErr = new TypeError('fetch failed');
      (fetchErr as any).cause = cause;
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => {
        throw fetchErr;
