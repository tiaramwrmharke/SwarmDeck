import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { TelegramBot } from '../src/channels/telegram/bot.ts';
import { FeishuBot } from '../src/channels/feishu/bot.ts';
import { recordKnownChatId } from '../src/core/config/user-config.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';

const ENV_KEYS = [
  'PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR', 'PIKILOOM_ALLOWED_IDS',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS',
  'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_CHAT_IDS',
] as const;

const snapshot = captureEnv(ENV_KEYS);

beforeEach(() => {
