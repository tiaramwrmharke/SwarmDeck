import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getSessionMessages } from '../src/agent/index.ts';
import { withTempHome } from './support/env.ts';
import type { MessageBlock } from '../src/agent/types.ts';

// History-view parity for Claude's two task-list mechanisms (TodoWrite snapshots vs
// TaskCreate/TaskUpdate incremental list): both must surface as plan blocks AND as Activity
// tool rows, and whichever mechanism wrote LAST owns the plan ("latest wins") — a TaskUpdate
// against a list abandoned by a newer TodoWrite must not resurrect the stale plan.

const WORKDIR = '/Users/test/taskplan';

async function parseSession(events: any[]): Promise<MessageBlock[][]> {
  return withTempHome(async (homeDir) => {
    const projectDir = path.join(homeDir, '.claude', 'projects', WORKDIR.replace(/[/\\:]/g, '-'));
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionId = 'sess-task-plan';
    fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), events.map(e => JSON.stringify(e)).join('\n'));
    const result = await getSessionMessages({ agent: 'claude', sessionId, workdir: WORKDIR, rich: true } as any);
    expect(result.ok).toBe(true);
    return (result.richMessages || []).filter(m => m.role === 'assistant').map(m => m.blocks);
  });
}

describe('claude history task-list parsing', () => {
  it('surfaces TodoWrite as both an Activity tool row and a plan block', async () => {
    const [blocks] = await parseSession([
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } },
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'updating todos' },
        { type: 'tool_use', id: 'tw1', name: 'TodoWrite', input: { todos: [
