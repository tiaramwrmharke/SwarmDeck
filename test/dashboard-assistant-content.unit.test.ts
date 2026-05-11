import { describe, expect, it } from 'vitest';
import { categorizeAssistantBlocks } from '../dashboard/src/pages/sessions/AssistantContent.tsx';
import type { MessageBlock } from '../dashboard/src/types.ts';

describe('AssistantContent block categorization', () => {
  it('renders explicit commentary blocks as normal output instead of activity notes', () => {
    const commentary: MessageBlock = {
      type: 'text',
      content: 'Tracing the Codex stream pipeline first.',
      phase: 'commentary',
    };
    const toolUse: MessageBlock = {
      type: 'tool_use',
      content: '{"cmd":"rg -n \\"stream\\" src"}',
      toolName: 'exec_command',
      toolId: 'call-1',
    };
    const toolResult: MessageBlock = {
      type: 'tool_result',
      content: 'src/bot.ts:610: snap.plan = event.plan?.steps?.length ? event.plan : null;',
      toolName: 'exec_command',
      toolId: 'call-1',
