import { describe, expect, it, beforeEach, vi } from 'vitest';

// Shared, hoisted mock state so the vi.mock factory (hoisted above imports) can reach it.
const h = vi.hoisted(() => ({
  resolvers: [] as Array<(value: unknown) => void>,
  count: 0,
}));

vi.mock('../dashboard/src/api', () => ({
  api: {
    getSessionMessages: () => {
      h.count++;
      return new Promise((resolve) => { h.resolvers.push(resolve); });
    },
  },
}));

import { loadSessionMessages } from '../dashboard/src/session-preload.ts';

function query(sessionId: string) {
  return { workdir: '/w', agent: 'claude', sessionId, rich: true, turnOffset: 0, turnLimit: 12 };
}
const userOnly = { ok: true, richMessages: [{ role: 'user', text: 'u', blocks: [] }], messages: [], totalTurns: 1 };
const withAssistant = {
  ok: true,
  richMessages: [
    { role: 'user', text: 'u', blocks: [] },
    { role: 'assistant', text: 'A', blocks: [{ type: 'text', content: 'A' }] },
  ],
