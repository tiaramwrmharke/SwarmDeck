import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeComChannel } from '../src/channels/wecom/channel.ts';

interface FakeWs {
  readyState: number;
  OPEN: 1;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function attachFakeWs(ch: any) {
  const sent: any[] = [];
  const fakeWs: FakeWs = {
    readyState: 1,
    OPEN: 1,
    send: vi.fn((payload: string, cb: (err?: Error) => void) => {
      sent.push(JSON.parse(payload));
      cb();
    }),
    close: vi.fn(),
  };
  ch.ws = fakeWs;
  return { fakeWs, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WeComChannel frame parsing and send', () => {
  it('handles heartbeat ack, routes callbacks, dedups, enforces allowlists, and uses correct send commands', async () => {
    {
