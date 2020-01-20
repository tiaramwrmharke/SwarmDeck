import { describe, expect, it } from 'vitest';
import {
  CODEX_56_MODEL_IDS,
  effortLabel,
  effortOptionsFor,
  splitEffortForAgent,
} from '../src/core/config/runtime-config.js';

describe('effortLabel — one canonical name per effort token', () => {
  it('returns the raw token, trimmed + lowercased (never a prose label)', () => {
    expect(effortLabel('xhigh')).toBe('xhigh');
    expect(effortLabel(' MAX ')).toBe('max');
    expect(effortLabel('Ultra')).toBe('ultra');
    expect(effortLabel(null)).toBe('');
    expect(effortLabel(undefined)).toBe('');
  });
});

describe('effortOptionsFor — picker labels stay identical to the token', () => {
  // The dashboard composer/turn-header and the IM picker/agent-status all render the same
  // string, so a level must read the same everywhere. Guards against reintroducing "Very High".
  for (const agent of ['claude', 'codex', 'hermes'] as const) {
