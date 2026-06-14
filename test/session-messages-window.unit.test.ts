import { describe, expect, it } from 'vitest';
import { applyTurnWindow, type TailMessage } from '../src/agent/index.ts';

function conversation(turns: number): TailMessage[] {
  const messages: TailMessage[] = [];
  for (let i = 1; i <= turns; i++) {
    messages.push({ role: 'user', text: `user ${i}` });
    messages.push({ role: 'assistant', text: `assistant ${i}` });
  }
  return messages;
}

describe('applyTurnWindow', () => {
  it('returns a windowed slice with pagination metadata and returns all turns when no window is requested', () => {
    const windowed = applyTurnWindow(conversation(4), { turnOffset: 1, turnLimit: 2 });
    expect(windowed.ok).toBe(true);
    expect(windowed.totalTurns).toBe(4);
    expect(windowed.messages.map(message => message.text)).toEqual([
