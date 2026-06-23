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
