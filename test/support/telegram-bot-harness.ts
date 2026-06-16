import type { TgContext } from '../../src/channels/telegram/channel.ts';
import { TelegramBot } from '../../src/channels/telegram/bot.ts';
import { vi } from 'vitest';

vi.mock('../../src/agent/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agent/index.ts')>();
  return { ...actual, initializeProjectSkills: vi.fn() };
});

export interface TelegramBotHarness {
  bot: TelegramBot;
  channel: any;
  ctx: TgContext;
  edits: Array<{ text: string; opts?: any }>;
  sends: Array<{ text: string; opts?: any }>;
  docs: Array<{ content: string | Buffer; filename: string; opts?: any }>;
  files: Array<{ filePath: string; opts?: any }>;
  reactions: Array<{ chatId: number; messageId: number; reactions: string[] }>;
}

