import { describe, expect, it } from 'vitest';
import { projectSnapshot } from '../src/pikichannel/adapter-swarmdeck.ts';
import { diffSnapshot, applySnapshotPatch, type UniversalSnapshot } from '../src/pikichannel/protocol.ts';

// A maximal StreamSnapshot exercising every field a remote client renders.
function maximalSnapshot(): any {
  return {
    phase: 'streaming',
    taskId: 't1',
    sessionId: 'native-id-123',
    queuedTaskIds: ['q1'],
    queuedTasks: [{ taskId: 'q1', prompt: 'queued one' }],
    question: 'the running prompt',
    incomplete: true,
    text: 'partial answer',
    thinking: 'partial reasoning',
    activity: 'Editing files',
    plan: { explanation: 'why', steps: [{ step: 'do A', status: 'inProgress' }] },
    model: 'claude-opus-4-8',
    effort: 'max',
    error: 'oops',
    artifacts: [{ url: '/a.png', fileName: 'a.png', fileSize: 10, mime: 'image/png', kind: 'photo', caption: 'c' }],
    startedAt: 1000,
    updatedAt: 2000,
    interactions: [{
      promptId: 'h1', kind: 'user-input', title: 'T', hint: 'hint', currentIndex: 0,
      questions: [{ id: 'ask-user', header: 'H', prompt: 'pick', options: [{ label: 'A', description: 'd', value: 'A' }], allowFreeform: true }],
    }],
    previewMeta: {
      inputTokens: 5, outputTokens: 6, cachedInputTokens: 1, contextUsedTokens: 100,
      contextPercent: 12, turnOutputTokens: 6, providerName: 'anthropic', generatingImages: 1,
      toolCalls: [{ id: 'c1', name: 'Read', summary: 'Read x', input: '{}', result: 'ok', status: 'done' }],
      subAgents: [{ id: 's1', kind: 'worker', description: 'sub', model: 'm', tools: [{ id: 'tt', name: 'Grep', summary: 'g' }], status: 'running' }],
    },
  };
}
