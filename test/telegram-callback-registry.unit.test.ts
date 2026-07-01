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
