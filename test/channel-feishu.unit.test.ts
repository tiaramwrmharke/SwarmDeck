import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeishuChannel } from '../src/channels/feishu/channel.ts';

function createTestChannel() {
  const ch = new FeishuChannel({ appId: 'test-app', appSecret: 'test-secret' });
  const patchMock = vi.fn();
  const createMock = vi.fn();
  const replyMock = vi.fn();
  (ch as any).client = {
    im: {
      message: {
        patch: patchMock,
        create: createMock,
        reply: replyMock,
        delete: vi.fn(async () => ({ code: 0 })),
      },
    },
    request: vi.fn(),
  };
  return { ch, patchMock, createMock, replyMock };
}

describe('FeishuChannel.editCard', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('succeeds silently, swallows not-modified responses, and no-ops on empty markdown', async () => {
    {
      const { ch, patchMock } = createTestChannel();
      patchMock.mockResolvedValue({ code: 0, msg: 'success', data: {} });
      await expect(
        ch.editCard('chat1', 'msg1', { markdown: 'updated text' }),
      ).resolves.toBeUndefined();
      expect(patchMock).toHaveBeenCalledTimes(1);
