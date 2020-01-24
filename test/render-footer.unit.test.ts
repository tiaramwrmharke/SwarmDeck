import { describe, it, expect } from 'vitest';
import { formatFooterParts } from '../src/bot/render-shared.js';

describe('formatFooterParts — BYOK profile name + provider', () => {
  it('shows the profile display name (not the raw modelId) and the provider on the final footer', () => {
    const parts = formatFooterParts('codex', 3000, null, null, {
      model: 'doubao-seed-2-1-pro-260628',
      effort: 'high',
      provider: '豆包 (Volcengine Ark)',
      profileName: '豆包 Seed 2.1',
    });
