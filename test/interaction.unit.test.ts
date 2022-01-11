import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/agent/index.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/agent/index.ts')>();
  return {
    ...actual,
    doStream: vi.fn(),
  };
});

import { doStream, type AgentInteraction, type StreamOpts } from '../src/agent/index.ts';
import { Bot, type StreamEvent, type InteractionSnapshot } from '../src/bot/bot.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';
import { makeStreamResult } from './support/stream-result.ts';

const envSnapshot = captureEnv(['PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR', 'DEFAULT_AGENT']);

beforeEach(() => {
  restoreEnv(envSnapshot);
  vi.clearAllMocks();
  const tmpConfig = makeTmpDir('interaction-unit-config-');
  process.env.PIKILOOM_CONFIG = `${tmpConfig}/setting.json`;
  process.env.PIKILOOM_WORKDIR = makeTmpDir('interaction-unit-workdir-');
  process.env.DEFAULT_AGENT = 'codex';
});

afterEach(() => {
  restoreEnv(envSnapshot);
});

function buildTestInteraction(overrides: Partial<AgentInteraction> = {}): AgentInteraction {
  return {
    kind: 'user-input',
    id: 'req-1',
    title: 'User Input Required',
    hint: 'Use the buttons when available.',
    questions: [
      {
        id: 'q1',
        header: 'Question',
        prompt: 'Choose a tool approval policy:',
        options: [
          { label: 'Allow', description: 'Allow the tool', value: 'Allow' },
          { label: 'Deny', description: 'Deny the tool', value: 'Deny' },
        ],
        allowFreeform: false,
        allowEmpty: true,
      },
    ],
    resolveWith: (answers) => ({
      answers: Object.fromEntries(
        Object.entries(answers).map(([id, vals]) => [id, { answers: vals }]),
      ),
    }),
    ...overrides,
  };
}

describe('Bot interaction handler via submitSessionTask (dashboard path)', () => {
  it('creates interaction prompts and resolves via select, cancel, and freeform text APIs', async () => {
    const doStreamMock = vi.mocked(doStream);
    const events: StreamEvent[] = [];

    doStreamMock.mockImplementationOnce(async (opts) => {
      const interactionPromise = opts.onInteraction?.(buildTestInteraction());
      expect(interactionPromise).toBeInstanceOf(Promise);
      const response = await interactionPromise;
      expect(response).toEqual({ answers: { q1: { answers: ['Allow'] } } });
      return makeStreamResult('codex', { sessionId: 'sess-interaction', message: 'done after interaction' });
    });

    const bot = new Bot();
    bot.onStreamSnapshot((key, snap) => {
      if (snap?.interactions?.length) {
        events.push({ type: 'interaction', taskId: snap.taskId, interaction: snap.interactions[0] });
      }
    });
    const submitted = bot.submitSessionTask({ agent: 'codex', sessionId: 'sess-interaction', workdir: process.env.PIKILOOM_WORKDIR!, prompt: 'do work' });
    expect(submitted.ok).toBe(true);

    let deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (bot.getStreamSnapshot('codex:sess-interaction')?.interactions?.length) break;
      await new Promise(r => setTimeout(r, 10));
    }

    const snap = bot.getStreamSnapshot('codex:sess-interaction');
    expect(snap?.interactions).toHaveLength(1);
    expect(snap!.interactions![0]).toMatchObject({ kind: 'user-input', title: 'User Input Required' });
    const promptId = snap!.interactions![0].promptId;

    const promptState = bot.interactionPrompt(promptId);
    expect(promptState).toBeTruthy();
    expect(promptState!.title).toBe('User Input Required');
    expect(promptState!.questions).toHaveLength(1);

