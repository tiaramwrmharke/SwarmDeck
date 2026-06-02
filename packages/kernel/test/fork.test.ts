import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { buildForkSeed } from '../src/runtime/fork.js';
import { claudeResumeArgs } from '../src/drivers/claude.js';
import { CodexDriver } from '../src/drivers/codex.js';
import { claudeAnchorResolvable, claudeTranscriptTailAnchor, codexRolloutTailAnchor } from '../src/drivers/native.js';
import { turnLanded } from '../src/protocol/index.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult, DriverEvent } from '../src/contracts/driver.js';

const flushTurns = () => new Promise((r) => setTimeout(r, 50));

// A scripted driver: records every AgentTurnInput, emits a session id, echoes. `forky`
// toggles capabilities.fork + resolveNativeAnchor so both fork modes are exercised.
class ScriptedDriver implements AgentDriver {
  readonly runs: AgentTurnInput[] = [];
  nextNativeId = 'native-1';
  tailAnchor: string | null = 'tail-anchor';
  anchorCalls = 0;
  /** Native ids the agent's own store does NOT hold (a run that died before creating one). */
  readonly missingNative = new Set<string>();
  /** null = the driver can't judge anchors; otherwise only these hydrate. */
  unresolvableAnchors: Set<string> | null = null;
  /** Next run reports a hard pre-flight failure — echoing back the id it was handed, as claude does. */
  failNext = false;
  constructor(readonly id: string, private readonly forky: boolean) {}
  get capabilities() { return { steer: false, interact: false, resume: true, tui: false, fork: this.forky, rewind: this.forky }; }
  resolveNativeAnchor(opts: { sessionId: string; workdir: string }): string | null {
    this.anchorCalls++;
    if (this.missingNative.has(opts.sessionId)) return null;
    return this.forky ? this.tailAnchor : null;
  }
  anchorResolvable(opts: { sessionId: string; workdir: string; anchor: string }): boolean {
    return this.unresolvableAnchors ? !this.unresolvableAnchors.has(opts.anchor) : true;
  }
  async run(input: AgentTurnInput, ctx: DriverContext): Promise<DriverResult> {
    this.runs.push(input);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, text: '', error: `No message found with message.uuid of: ${input.fork?.anchor}`, sessionId: this.nextNativeId };
    }
    ctx.emit({ type: 'session', sessionId: this.nextNativeId });
    const text = `reply to: ${input.prompt.slice(0, 40)}`;
    ctx.emit({ type: 'text', delta: text });
    return { ok: true, text, sessionId: this.nextNativeId, anchor: `${this.nextNativeId}/a1`, stopReason: 'end_turn' };
  }
}

describe('claudeResumeArgs (fork flag contract)', () => {
  it('plain resume appends to the session', () => {
    expect(claudeResumeArgs('sid')).toEqual(['--resume', 'sid']);
  });
  it('fork at tail adds --fork-session only', () => {
    expect(claudeResumeArgs('sid', {})).toEqual(['--resume', 'sid', '--fork-session']);
    expect(claudeResumeArgs('sid', { anchor: null })).toEqual(['--resume', 'sid', '--fork-session']);
  });
  it('anchored fork adds the inclusive keep-boundary', () => {
    expect(claudeResumeArgs('sid', { anchor: 'uuid-7' }))
      .toEqual(['--resume', 'sid', '--fork-session', '--resume-session-at', 'uuid-7']);
  });
});

describe('buildForkSeed', () => {
  it('role-tags the copied turns and wraps them in fork-context', () => {
    const seed = buildForkSeed([
      { phase: 'done', updatedAt: 1, prompt: 'q1', text: 'a1' },
      { phase: 'done', updatedAt: 2, prompt: 'q2', text: 'a2' },
    ]);
    expect(seed).toContain('<fork-context turns=2>');
    expect(seed).toContain('User: q1');
    expect(seed).toContain('Assistant: a2');
    expect(seed!.trim().endsWith('</fork-context>')).toBe(true);
  });
  it('is null for an empty transcript and tail-truncates whole messages', () => {
    expect(buildForkSeed([])).toBeNull();
    const seed = buildForkSeed([
      { phase: 'done', updatedAt: 1, prompt: 'old '.repeat(50), text: 'old-reply' },
      { phase: 'done', updatedAt: 2, prompt: 'new-question', text: 'new-reply' },
    ], 60);
    expect(seed).toContain('new-reply');
    expect(seed).not.toContain('old-reply');
  });
});

describe('turnLanded (the boundary rule)', () => {
  it('a clean turn is a boundary, a refused one is not', () => {
    expect(turnLanded({ text: 'an answer' })).toBe(true);
    expect(turnLanded({ error: 'Prompt is too long', text: '', reasoning: '', toolCalls: [] })).toBe(false);
    expect(turnLanded({ error: 'spawn ENOENT' })).toBe(false);
  });
  it('an error AFTER output is still a boundary — an interrupt leaves real context', () => {
    expect(turnLanded({ error: 'Interrupted by user.', text: 'partial' })).toBe(true);
    expect(turnLanded({ error: 'crashed', reasoning: 'thinking…' })).toBe(true);
