import { describe, expect, it, vi } from 'vitest';
import { LivePreview, type LivePreviewRenderer, type PreviewChannel } from '../src/channels/telegram/live-preview.ts';

const renderer: LivePreviewRenderer = {
  renderInitial: () => 'initial',
  renderStream: ({ bodyText }) => `stream:${bodyText}`,
};

function createChannel() {
  const editMessage = vi.fn();
  const sendTyping = vi.fn(async () => {});
  const channel: PreviewChannel = {
    editMessage,
    sendTyping,
  };
  return { channel, editMessage };
}

async function flush(preview: LivePreview) {
  await (preview as any).editChain;
}

describe('LivePreview placeholder lifecycle', () => {
  it('abandons on consecutive failures, resets counter on success, and no-ops without a placeholder', async () => {
    {
      const { channel, editMessage } = createChannel();
      editMessage.mockRejectedValue(Object.assign(new Error('edit card failed: code=230020'), { feishuEditFailed: true }));
      const preview = new LivePreview({
        agent: 'claude',
        chatId: 'c1',
        placeholderMessageId: 'placeholder',
        channel,
        renderer,
        streamEditIntervalMs: 0,
        startTimeMs: Date.now(),
        canEditMessages: true,
        canSendTyping: false,
        log: () => {},
      });
