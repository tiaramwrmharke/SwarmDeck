import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoist = vi.hoisted(() => {
  const sentMessages: { channelId: string; payload: any }[] = [];
  const editedMessages: { channelId: string; messageId: string; payload: any }[] = [];
  const onceHandlers: Record<string, ((...args: any[]) => any)[]> = {};
  const onHandlers: Record<string, ((...args: any[]) => any)[]> = {};
  return { sentMessages, editedMessages, onceHandlers, onHandlers };
});

vi.mock('discord.js', () => {
  class FakeMessage {
    id = `M${Math.floor(Math.random() * 100000)}`;
    constructor(public channelId: string) {}
    edit = vi.fn(async (payload: any) => {
      hoist.editedMessages.push({ channelId: this.channelId, messageId: this.id, payload });
      return this;
    });
    delete = vi.fn(async () => undefined);
  }
  class FakeChannel {
    messages: any;
    constructor(public id: string) {
      const inner = new Map<string, FakeMessage>();
      this.messages = {
        fetch: vi.fn(async (msgId: string) => {
          const existing = inner.get(msgId);
          if (existing) return existing;
          const msg = new FakeMessage(this.id);
          msg.id = msgId;
          inner.set(msgId, msg);
          return msg;
        }),
      };
    }
    send = vi.fn(async (payload: any) => {
      const msg = new FakeMessage(this.id);
      hoist.sentMessages.push({ channelId: this.id, payload });
      return msg;
    });
  }
  class FakeClient {
    user = { id: 'BOT_USER', username: 'swarmdeck', displayName: 'swarmdeck' };
    channels = {
      cache: new Map<string, FakeChannel>(),
      fetch: vi.fn(async (id: string) => {
        const ch = new FakeChannel(id);
        this.channels.cache.set(id, ch);
        return ch;
      }),
