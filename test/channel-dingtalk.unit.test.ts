import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dingtalk-stream', () => {
  const TOPIC_ROBOT = '/v1.0/im/bot/messages/get';
  class FakeDWClient {
    config: any;
    registered: any = null;
    constructor(opts: any) { this.config = opts; }
    registerCallbackListener = vi.fn((_topic: string, cb: any) => { this.registered = cb; return this; });
    getAccessToken = vi.fn(async () => 'fake-token');
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(() => undefined);
    socketCallBackResponse = vi.fn();
  }
  return {
    DWClient: FakeDWClient,
    TOPIC_ROBOT,
    EventAck: { SUCCESS: 'SUCCESS', LATER: 'LATER' },
  };
});

import { DingtalkChannel } from '../src/channels/dingtalk/channel.ts';

const fetchCalls: { url: string; init?: any }[] = [];

beforeEach(() => {
  fetchCalls.length = 0;
  global.fetch = vi.fn(async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  }) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DingtalkChannel', () => {
  it('connects, dispatches messages via sessionWebhook, dedups, throws without webhook, and enforces allowlists', async () => {
    {
      const ch = new DingtalkChannel({ clientId: 'app-key', clientSecret: 'app-secret' });
      const bot = await ch.connect();
      expect(bot.id).toBe('app-key');
