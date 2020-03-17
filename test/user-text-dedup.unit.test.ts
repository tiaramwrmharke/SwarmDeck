import { describe, expect, it } from 'vitest';
import {
  displayPromptForPending,
  latestOwnPlan,
  normalizeUserText,
  promptEndsWithUserPrompt,
  sameUserText,
  shouldCarryLatestPlanIntoLiveStream,
  streamPromptMatchesTurnText,
} from '../dashboard/src/pages/sessions/utils';
import type { MessageBlock } from '../dashboard/src/types';

function planBlock(steps: Array<{ step: string; status: 'pending' | 'inProgress' | 'completed' }>): MessageBlock {
  return { type: 'plan', content: '', plan: { explanation: null, steps } };
}
const toolBlock: MessageBlock = { type: 'tool_use', content: '', toolName: 'Bash' };
const textBlock: MessageBlock = { type: 'text', content: 'done' };

// shortValue(text, 500): first (500-3) chars, trimEnd, + '...'
function shortValue(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

describe('sameUserText (image-dedup whitespace robustness)', () => {
  it('matches a multi-line prompt against its whitespace-collapsed transcript form', () => {
    const raw = 'What is in this image?\nAlso, what does the README say?';
    const collapsed = 'What is in this image? Also, what does the README say?';
    expect(sameUserText(raw, collapsed)).toBe(true);
  });

  it('treats trailing/leading and doubled whitespace as equal', () => {
    expect(sameUserText('  hello   world \n', 'hello world')).toBe(true);
    expect(sameUserText('line1\n\nline2', 'line1 line2')).toBe(true);
  });
