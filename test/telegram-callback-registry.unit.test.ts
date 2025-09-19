import { describe, expect, it } from 'vitest';
import {
  renderCommandSelectionKeyboard,
  unpackCallbackData,
} from '../src/channels/telegram/render.ts';
import {
  decodeCommandAction,
  type CommandActionButton,
  type CommandSelectionView,
} from '../src/bot/command-ui.ts';

function viewWith(rows: CommandActionButton[][]): CommandSelectionView {
  return { kind: 'models', title: 'Models', metaLines: [], items: [], rows };
}

describe('Telegram callback_data registry', () => {
  it('packs an over-length BYOK model action under Telegram’s 64-byte cap', () => {
    const action = {
      kind: 'models.select.model' as const,
      modelId: 'deepseek/deepseek-chat-v3-0324',
