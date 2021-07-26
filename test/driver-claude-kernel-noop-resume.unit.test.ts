import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeDriver, runTurn } from '../packages/kernel/dist/index.js';
// White-box settle heuristics live at the module path, off the public barrel.
import {
  isClaudeSyntheticResumeNoise, claudeProducedRealOutput, claudeResumeNoopRetryLimit,
  handleClaudeEvent, isClaudeSlashCommand,
} from '../packages/kernel/dist/drivers/claude.js';

// Regression: resuming a claude session whose PREVIOUS turn was left incomplete (a background hold
// that reclaimed its sub-agents/workflow — the ultra "no response" report — an interrupt, a stall)
// makes the CLI answer with a synthetic "No response requested." no-op that ran none of our prompt,
// instead of processing the message. The driver used to settle on that empty result → the user saw
// a silent "(no textual response)" in ~0s and had to re-send several times. The driver now detects a
// resume that produced NO real model output and re-issues the prompt over the still-open stdin
// (bounded) so the CLI drives through its repair to a real answer within the one turn.

describe('isClaudeSyntheticResumeNoise', () => {
  it('matches the CLI resume-repair placeholder (case / trailing-dot insensitive)', () => {
    expect(isClaudeSyntheticResumeNoise('No response requested.')).toBe(true);
    expect(isClaudeSyntheticResumeNoise('  no response requested  ')).toBe(true);
    expect(isClaudeSyntheticResumeNoise('No response requested')).toBe(true);
  });
  it('does not match real model text or emptiness', () => {
    expect(isClaudeSyntheticResumeNoise('Here is your answer.')).toBe(false);
    expect(isClaudeSyntheticResumeNoise('')).toBe(false);
    expect(isClaudeSyntheticResumeNoise('No response requested yet, working on it')).toBe(false);
  });
});

describe('isClaudeSlashCommand', () => {
  it('matches a leading slash command (bare, with args, namespaced, hyphenated)', () => {
    expect(isClaudeSlashCommand('/compact')).toBe(true);
    expect(isClaudeSlashCommand('/clear')).toBe(true);
    expect(isClaudeSlashCommand('/compact focus on the API')).toBe(true);
    expect(isClaudeSlashCommand('/model claude-opus-4-8')).toBe(true);
    expect(isClaudeSlashCommand('/my-command')).toBe(true);
    expect(isClaudeSlashCommand('/plugin:skill')).toBe(true);
