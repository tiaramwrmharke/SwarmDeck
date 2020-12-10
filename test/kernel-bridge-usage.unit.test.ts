import { describe, it, expect } from 'vitest';
import { kernelUsageToResultFields } from '../src/agent/kernel-bridge.js';

// Regression: the IM final footer (feishu/telegram formatFinalFooter) reads
// result.contextPercent. The bridge used to map the final kernel usage with
// contextPercent hardcoded to null, so the % showed on the live footer (preview
// meta carries it) but vanished from the finished message.
describe('kernel-bridge final usage projection', () => {
  it('carries contextPercent (and the token counts) into the final StreamResult fields', () => {
    const fields = kernelUsageToResultFields({
      inputTokens: 60_000,
      outputTokens: 150,
