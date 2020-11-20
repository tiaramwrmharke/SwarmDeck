import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleClaudeEvent, pollClaudeSubAgentTails, applyClaudeSubAgentResult,
  isFailedTaskStatus, type ClaudeSubTail,
} from '../src/drivers/claude.js';
import type { DriverEvent } from '../src/contracts/driver.js';

function freshState(): any {
  return { text: '', reasoning: '', streamedText: false, sessionId: null, input: null, output: null, cached: null };
}

function run(events: any[], s: any = freshState()): { out: DriverEvent[]; s: any } {
  const out: DriverEvent[] = [];
  for (const ev of events) handleClaudeEvent(ev, s, (e) => out.push(e));
  return { out, s };
}

const SPAWN = {
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { subagent_type: 'Explore', description: 'map the repo', prompt: 'Explore the repo and report back.' } }] },
};

const ASYNC_LAUNCH_TEXT =
  'Async agent launched successfully. (internal metadata)\n'
  + "agentId: abc123def456 (internal ID - do not mention to user. Use SendMessage with to: 'abc123def456' to continue this agent.)\n"
  + 'The agent is working in the background. You will be notified automatically when it completes.\n'
  + 'output_file: /tmp/nonexistent/tasks/abc123def456.output\n'
  + 'Do NOT Read or tail this file via the shell tool.';

const asyncLaunchResult = (outputFile?: string) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: outputFile ? ASYNC_LAUNCH_TEXT.replace('/tmp/nonexistent/tasks/abc123def456.output', outputFile) : ASYNC_LAUNCH_TEXT }] }] },
});

describe('claude sub-agent lifecycle (background/run_in_background default)', () => {
  it('captures the task prompt at spawn', () => {
    const { out } = run([SPAWN]);
    const ev = out.find((e) => e.type === 'subagent') as any;
    expect(ev.subagent.prompt).toBe('Explore the repo and report back.');
    expect(ev.subagent.status).toBe('running');
  });

  it('a SYNC tool_result settles the sub with report (+ sidecar cost facts)', () => {
