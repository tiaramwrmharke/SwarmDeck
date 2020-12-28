import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexTurnInput,
  doClaudeStream,
  doCodexStream,
  doGeminiStream,
  doStream,
  dropNativeShadowedByProfiles,
  ensureManagedSession,
  findManagedThreadSession,
  getSessions,
  getSessionMessages,
  getSessionTail,
  getUsage,
  labelFromWindowMinutes,
  listSwarmDeckSessions,
  listModels,
  mergeManagedAndNativeSessions,
  promoteSessionId,
  sanitizeSessionUserPreviewText,
  sessionListDisplayTitle,
  shutdownCodexServer,
  stageSessionFiles,
  type ModelInfo,
  type StreamOpts,
} from '../src/agent/index.ts';
import {
  claudeParse,
  createClaudeStreamState,
  pendingClaudeBackgroundAgentCount,
  extractClaudeWorkflowRunId,
  claudeEffortAndWorkflowArgs,
} from '../src/agent/drivers/claude.ts';
import { makeTmpDir, withTempHome } from './support/env.ts';

const tmpDir = path.join(os.tmpdir(), 'swarmdeck-test-' + process.pid);
const fakeBin = path.join(tmpDir, 'bin');

function writeFakeScript(name: string, jsonLines: object[]) {
  const payload = jsonLines.map(j => JSON.stringify(j)).join('\n');
  const script = `#!/bin/sh\ncat <<'JSONL_EOF'\n${payload}\nJSONL_EOF\n`;
  const p = path.join(fakeBin, name);
  fs.writeFileSync(p, script, { mode: 0o755 });
}

function baseOpts(agent: 'codex' | 'claude' | 'gemini', extra: Partial<StreamOpts> = {}): StreamOpts {
  return {
    agent,
    prompt: 'test prompt',
    workdir: tmpDir,
    timeout: 10,
    sessionId: null,
    model: null,
    thinkingEffort: 'high',
    onText: () => {},
    ...extra,
  };
}

beforeEach(() => {
  fs.mkdirSync(fakeBin, { recursive: true });
  process.env.PATH = `${fakeBin}:${process.env.PATH}`;
  process.env.PIKILOOM_CLAUDE_PRINT = '1';
  shutdownCodexServer();
});

afterEach(() => {
  delete process.env.PIKILOOM_CLAUDE_PRINT;
});

describe('buildCodexTurnInput and usage helpers', () => {
  it('builds turn input, normalizes windows, sanitizes previews, and merges managed/native sessions', async () => {
    const imagePath = path.join(tmpDir, 'shot.png');
    const docPath = path.join(tmpDir, 'notes.txt');

    const input = buildCodexTurnInput('inspect this', [imagePath, docPath]);

    expect(input).toEqual([
      { type: 'localImage', path: imagePath },
      { type: 'text', text: `[Attached file: ${docPath}]` },
      { type: 'text', text: 'inspect this' },
    ]);

    expect(labelFromWindowMinutes(301, 'Primary')).toBe('5h');
    expect(labelFromWindowMinutes(10081, 'Secondary')).toBe('7d');

    expect(sanitizeSessionUserPreviewText('[Request interrupted by user]')).toBe('');
    expect(sanitizeSessionUserPreviewText('[Request interrupted by user for tool use]')).toBe('');
    expect(sanitizeSessionUserPreviewText('[Image: original 2316x1558, displayed at 2000x1338]')).toBe('');
    expect(sanitizeSessionUserPreviewText('[Attached file: /tmp/shot.png]')).toBe('');
    expect(sanitizeSessionUserPreviewText('[Image: original 2316x1558] 帮我看一下这里为什么有间距')).toBe('帮我看一下这里为什么有间距');
    expect(sanitizeSessionUserPreviewText('正常问题')).toBe('正常问题');
    expect(sanitizeSessionUserPreviewText('@/Users/me/.swarmdeck/sessions/claude/x/workspace/image.png\n\n看一下截图')).toBe('看一下截图');
    expect(sanitizeSessionUserPreviewText('@/tmp/a.jpg @/tmp/b.webp prompt')).toBe('prompt');
    expect(sanitizeSessionUserPreviewText('@user mentions are not paths')).toBe('@user mentions are not paths');

    {
    const merged = mergeManagedAndNativeSessions([
      {
        sessionId: 'sess-1',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: '/tmp/swarmdeck/workspace',
        model: 'local-model',
        createdAt: '2026-03-16T00:00:00.000Z',
        title: 'local title',
        running: false,
        runState: 'incomplete',
        runDetail: 'local detail',
        runUpdatedAt: '2026-03-16T00:02:00.000Z',
        lastQuestion: 'local question',
        lastAnswer: 'local answer',
        lastMessageText: 'local answer',
      },
    ], [
      {
        sessionId: 'sess-1',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: null,
        model: 'native-model',
        createdAt: '2026-03-16T00:01:00.000Z',
        title: 'native title',
        running: true,
        runState: 'completed',
        runDetail: null,
        runUpdatedAt: '2026-03-16T00:01:30.000Z',
        lastQuestion: 'native question',
        lastAnswer: 'native answer',
        lastMessageText: 'native answer',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sessionId: 'sess-1',
      title: 'native title',
      model: 'native-model',
      createdAt: '2026-03-16T00:01:00.000Z',
      workspacePath: '/tmp/swarmdeck/workspace',
      running: true,
      runState: 'incomplete',
      runDetail: 'local detail',
      runUpdatedAt: '2026-03-16T00:02:00.000Z',
      lastQuestion: 'local question',
      lastAnswer: 'local answer',
      lastMessageText: 'local answer',
    });
    }

    {
    const merged = mergeManagedAndNativeSessions([
      {
        sessionId: 'sess-eff', agent: 'claude', workdir: tmpDir,
        workspacePath: '/tmp/swarmdeck/workspace', model: 'claude-opus-4-8',
        thinkingEffort: 'max', workflowEnabled: true,
        createdAt: '2026-03-16T00:00:00.000Z', title: 't',
        running: false, runState: 'completed', runDetail: null,
        runUpdatedAt: '2026-03-16T00:00:00.000Z',
        lastQuestion: 'q', lastAnswer: 'a', lastMessageText: 'a',
      },
    ], [
      {
        sessionId: 'sess-eff', agent: 'claude', workdir: tmpDir,
        workspacePath: null, model: 'claude-opus-4-8',
        thinkingEffort: undefined, workflowEnabled: undefined,
        createdAt: '2026-03-16T00:01:00.000Z', title: 't',
        running: false, runState: 'completed', runDetail: null,
        runUpdatedAt: '2026-03-16T00:01:00.000Z',
        lastQuestion: 'q', lastAnswer: 'a', lastMessageText: 'a',
      },
    ]);
    expect(merged[0].thinkingEffort).toBe('max');
    expect(merged[0].workflowEnabled).toBe(true);
    }

    {
    const merged = mergeManagedAndNativeSessions([
      {
        sessionId: 'sess-2',
        agent: 'claude',
        workdir: tmpDir,
        workspacePath: '/tmp/swarmdeck/workspace',
        model: 'claude-opus-4-7',
        createdAt: '2026-03-16T00:00:00.000Z',
        title: 'stale title',
        running: false,
        runState: 'completed',
        runDetail: null,
        runUpdatedAt: '2026-03-16T00:02:00.000Z',
        lastQuestion: 'old question',
        lastAnswer: 'old answer',
        lastMessageText: 'old answer',
      },
    ], [
      {
        sessionId: 'sess-2',
        agent: 'claude',
        workdir: tmpDir,
        workspacePath: null,
        model: 'claude-opus-4-7',
        createdAt: '2026-03-16T00:00:00.000Z',
        title: 'native title',
        running: false,
        runState: 'completed',
        runDetail: null,
        runUpdatedAt: '2026-03-16T00:05:00.000Z',
        lastQuestion: 'new question',
        lastAnswer: 'new answer',
        lastMessageText: 'new answer',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sessionId: 'sess-2',
      workspacePath: '/tmp/swarmdeck/workspace',
      runUpdatedAt: '2026-03-16T00:05:00.000Z',
      lastQuestion: 'new question',
      lastAnswer: 'new answer',
      lastMessageText: 'new answer',
    });
    }

    {
    const merged = mergeManagedAndNativeSessions([
      {
        sessionId: 'sess-preview-1',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: '/tmp/swarmdeck/workspace',
        model: 'o3',
        createdAt: '2026-03-20T10:00:00.000Z',
        title: 'managed title',
        running: false,
        runState: 'completed',
        runDetail: 'managed detail',
        runUpdatedAt: '2026-03-20T10:05:00.000Z',
        lastQuestion: 'managed question',
        lastAnswer: 'managed answer (latest)',
        lastMessageText: 'managed answer (latest)',
      },
    ], [
      {
        sessionId: 'sess-preview-1',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: null,
        model: 'o3',
        createdAt: '2026-03-20T10:00:00.000Z',
        title: 'native title',
        running: false,
        runState: 'completed',
        runDetail: 'native detail',
        runUpdatedAt: '2026-03-20T10:03:00.000Z',
        lastQuestion: 'native question (stale)',
        lastAnswer: 'native answer (stale)',
        lastMessageText: 'native answer (stale)',
      },
    ]);

    expect(merged).toHaveLength(1);
    const s = merged[0];
    expect(s.runState).toBe('completed');
    expect(s.runDetail).toBe('managed detail');
    expect(s.runUpdatedAt).toBe('2026-03-20T10:05:00.000Z');
    expect(s.lastQuestion).toBe('managed question');
    expect(s.lastAnswer).toBe('managed answer (latest)');
    expect(s.lastMessageText).toBe('managed answer (latest)');
    }

    {
    const merged = mergeManagedAndNativeSessions([
      {
        sessionId: 'sess-preview-2',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: '/tmp/swarmdeck/workspace',
        model: 'o3',
        createdAt: '2026-03-20T10:00:00.000Z',
        title: 'managed title',
        running: false,
        runState: 'completed',
        runDetail: 'managed detail',
        runUpdatedAt: '2026-03-20T10:05:00.000Z',
        lastQuestion: 'managed question (stale)',
        lastAnswer: 'managed answer (stale)',
        lastMessageText: 'managed answer (stale)',
      },
    ], [
      {
        sessionId: 'sess-preview-2',
        agent: 'codex',
        workdir: tmpDir,
        workspacePath: null,
        model: 'o3',
        createdAt: '2026-03-20T10:00:00.000Z',
        title: 'native title',
        running: false,
        runState: 'completed',
        runDetail: 'native detail',
        runUpdatedAt: '2026-03-20T10:08:00.000Z',
        lastQuestion: 'native question (latest)',
        lastAnswer: 'native answer (latest)',
        lastMessageText: 'native answer (latest)',
      },
    ]);

    expect(merged).toHaveLength(1);
    const s = merged[0];
    expect(s.runState).toBe('completed');
    expect(s.runDetail).toBe('native detail');
    expect(s.runUpdatedAt).toBe('2026-03-20T10:08:00.000Z');
    expect(s.lastQuestion).toBe('native question (latest)');
    expect(s.lastAnswer).toBe('native answer (latest)');
    expect(s.lastMessageText).toBe('native answer (latest)');
    expect(s.workspacePath).toBe('/tmp/swarmdeck/workspace');
    }

    await withTempHome(async (homeDir) => {
      const workdir = makeTmpDir('swarmdeck-workdir-');
      const otherWorkdir = makeTmpDir('swarmdeck-other-workdir-');
      const sessionsDir = path.join(homeDir, '.codex', 'sessions', '2026', '03', '28');
      fs.mkdirSync(sessionsDir, { recursive: true });

      const writeRollout = (filename: string, payload: Record<string, unknown>) => {
        fs.writeFileSync(
          path.join(sessionsDir, filename),
          JSON.stringify({ timestamp: '2026-03-28T00:13:16.000Z', type: 'session_meta', payload }) + '\n',
        );
      };

      writeRollout('rollout-parent.jsonl', {
        id: 'sess-parent',
        timestamp: '2026-03-28T00:12:31.000Z',
        cwd: workdir,
        originator: 'swarmdeck',
      });
      writeRollout('rollout-child.jsonl', {
        id: 'sess-child',
        timestamp: '2026-03-28T00:13:16.000Z',
        cwd: workdir,
        originator: 'swarmdeck',
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: 'sess-parent',
              depth: 1,
              agent_nickname: 'Kepler',
              agent_role: 'explorer',
            },
          },
        },
      });
      writeRollout('rollout-other.jsonl', {
        id: 'sess-other',
        timestamp: '2026-03-28T00:14:00.000Z',
        cwd: otherWorkdir,
        originator: 'swarmdeck',
      });

      const result = await getSessions({ agent: 'codex', workdir });

      expect(result.ok).toBe(true);
      expect(result.sessions.map(session => session.sessionId)).toEqual(['sess-parent']);
    });
  });
});

describe('stageSessionFiles', () => {
  it('stages/migrates uploads, sets titles, promotes pending sessions, and keeps per-agent records distinct', () => {
    {
    const uploadDir = makeTmpDir('swarmdeck-upload-');
    const uploadPath = path.join(uploadDir, 'report.txt');
    fs.writeFileSync(uploadPath, 'hello');

    const staged = stageSessionFiles({
      agent: 'claude',
      workdir: tmpDir,
      files: [uploadPath],
    });

    const stagedDir = path.join(tmpDir, '.swarmdeck', 'sessions', 'claude', staged.sessionId);
    expect(staged.workspacePath).toBe(path.join(stagedDir, 'workspace'));
    expect(fs.existsSync(path.join(staged.workspacePath, 'report.txt'))).toBe(true);
    expect(fs.existsSync(path.join(stagedDir, 'session.json'))).toBe(true);

    const legacySessionId = 'sess_legacy_layout';
    const legacyWorkspacePath = path.join(tmpDir, '.swarmdeck', 'workspaces', 'claude', legacySessionId);
    const legacyMetaDir = path.join(legacyWorkspacePath, '.swarmdeck');
    fs.mkdirSync(legacyMetaDir, { recursive: true });
    fs.writeFileSync(path.join(legacyWorkspacePath, 'legacy.txt'), 'legacy');
    fs.writeFileSync(path.join(legacyMetaDir, 'return.json'), JSON.stringify({
      files: [{ path: 'legacy.txt', kind: 'document' }],
    }));
    fs.mkdirSync(path.join(tmpDir, '.swarmdeck', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.swarmdeck', 'sessions', 'index.json'), JSON.stringify({
      version: 1,
      sessions: [{
