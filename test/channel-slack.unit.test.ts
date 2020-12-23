import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoist = vi.hoisted(() => {
  const calls: { method: string; payload: any }[] = [];
  const results: Record<string, (payload: any) => any> = {
    'auth.test': () => ({ ok: true, user_id: 'BOT_USER', team: 'TestTeam', user: 'swarmdeck_bot' }),
    'chat.postMessage': () => ({ ok: true, ts: `${Date.now()}.000100` }),
    'chat.update': () => ({ ok: true }),
    'chat.delete': () => ({ ok: true }),
  };
  return { calls, results };
});

vi.mock('@slack/web-api', () => {
  class MockWebClient {
    constructor(_token?: string) {}
    auth = {
      test: vi.fn(async () => {
        hoist.calls.push({ method: 'auth.test', payload: {} });
        return hoist.results['auth.test']!({});
      }),
    };
    chat = {
      postMessage: vi.fn(async (payload: any) => {
        hoist.calls.push({ method: 'chat.postMessage', payload });
        return hoist.results['chat.postMessage']!(payload);
      }),
      update: vi.fn(async (payload: any) => {
        hoist.calls.push({ method: 'chat.update', payload });
        return hoist.results['chat.update']!(payload);
      }),
      delete: vi.fn(async (payload: any) => {
        hoist.calls.push({ method: 'chat.delete', payload });
        return hoist.results['chat.delete']!(payload);
      }),
