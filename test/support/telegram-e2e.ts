import type { TelegramChannel, TgCallbackContext, TgContext, TgMessage } from '../../src/channels/telegram/channel.ts';

export interface ReceivedMsg {
  text: string;
  files: string[];
  chatId: number;
  fromId?: number;
}

export interface ReceivedCmd {
  cmd: string;
  args: string;
  chatId: number;
}

export interface ReceivedCb {
  data: string;
  chatId: number;
  callbackId: string;
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function promptChat(
  channel: Pick<TelegramChannel, 'send'>,
  chatId: number,
  sentMsgIds: number[],
  text: string,
  opts?: any,
  promptDelayMs = 2_000,
): Promise<void> {
  const msgId = await channel.send(chatId, text, opts);
  if (msgId) sentMsgIds.push(msgId);
  await wait(promptDelayMs);
}

