import { describe, expect, it } from 'vitest';
import { applyTurnWindow, type TailMessage } from '../src/agent/index.ts';

function conversation(turns: number): TailMessage[] {
  const messages: TailMessage[] = [];
  for (let i = 1; i <= turns; i++) {
    messages.push({ role: 'user', text: `user ${i}` });
    messages.push({ role: 'assistant', text: `assistant ${i}` });
  }
  return messages;
