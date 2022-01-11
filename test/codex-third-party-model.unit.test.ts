import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  recoverProfileIdForModel, humanizeCodexError,
  type Agent,
} from '../src/agent/index.js';
import {
  addProvider, addProfile, setActiveProfile,
  type ProviderKind,
} from '../src/model/index.js';
import { sealInline } from '../src/core/secrets/index.js';

describe('humanizeCodexError — ChatGPT-account rejects third-party models', () => {
  it('translates the raw upstream JSON into an actionable instruction', () => {
    const raw = `{"detail":"The 'deepseek-v4-pro' model is not supported when using Codex with a ChatGPT account."}`;
    const out = humanizeCodexError(raw);
    expect(out).not.toBe(raw);
    expect(out).toContain('deepseek-v4-pro');
    expect(out).toContain('ChatGPT');
    expect(out).toContain('智能体配置');
    expect(out).not.toContain('"detail"');
  });

  it('captures the rejected model id regardless of wrapping', () => {
    const out = humanizeCodexError("The 'kimi-k2' model is not supported when using Codex with a ChatGPT account.");
    expect(out).toContain('kimi-k2');
  });

  it('passes unrelated errors through untouched', () => {
    expect(humanizeCodexError('turn/start failed')).toBe('turn/start failed');
  });
