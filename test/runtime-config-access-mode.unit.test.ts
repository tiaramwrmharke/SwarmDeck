import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveClaudeAccessMode,
  claudeAccessModeEnv,
  setClaudeAccessModeEnv,
  DEFAULT_CLAUDE_ACCESS_MODE,
} from '../src/core/config/runtime-config.js';

describe('resolveClaudeAccessMode', () => {
  const ENV_KEYS = ['PIKILOOM_CLAUDE_PRINT', 'PIKILOOM_CLAUDE_TUI'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('defaults to api (claude -p) with no config and no env', () => {
    expect(resolveClaudeAccessMode({})).toBe('api');
    expect(DEFAULT_CLAUDE_ACCESS_MODE).toBe('api');
  });

