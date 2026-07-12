import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getSessionMessages, shutdownCodexServer } from '../src/agent/index.ts';
import { withTempHome } from './support/env.ts';

afterEach(() => {
  shutdownCodexServer();
});

describe('Codex session history', () => {
  it('reconstructs rich history (commentary/tools/plan/thinking) and surfaces generated images', async () => {
    await withTempHome(async homeDir => {
      const workdir = path.join(homeDir, 'project');
      const workspacePath = path.join(workdir, '.swarmdeck', 'sessions', 'codex', 'sess-rich', 'workspace');
      const rolloutDir = path.join(homeDir, '.codex', 'sessions', '2026', '03', '29');
      fs.mkdirSync(workdir, { recursive: true });
      fs.mkdirSync(workspacePath, { recursive: true });
      fs.mkdirSync(rolloutDir, { recursive: true });

      const rolloutPath = path.join(rolloutDir, 'rollout-2026-03-29T10-25-14-test.jsonl');
      fs.writeFileSync(rolloutPath, [
        JSON.stringify({
          timestamp: '2026-03-29T10:25:14.000Z',
          type: 'session_meta',
          payload: { id: 'sess-rich', cwd: workdir },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:15.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'Please fix the live preview.' },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:16.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'commentary',
            content: [{ type: 'output_text', text: 'Tracing the Codex stream pipeline first.' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:17.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            call_id: 'call_exec_1',
            arguments: JSON.stringify({ cmd: 'rg -n "activity|thinking|plan" src dashboard' }),
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:18.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call_output',
            call_id: 'call_exec_1',
            output: 'src/bot.ts:610:          snap.plan = event.plan?.steps?.length ? event.plan : null;',
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:19.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'update_plan',
            call_id: 'call_plan_1',
            arguments: JSON.stringify({
              explanation: 'Keep completion previews and rebuild Codex rich history.',
              plan: [
                { step: 'Preserve done snapshot text/thinking/activity', status: 'completed' },
                { step: 'Parse rollout response items into rich messages', status: 'completed' },
                { step: 'Render historical plan blocks in SessionPanel', status: 'completed' },
              ],
            }),
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-29T10:25:20.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call_output',
            call_id: 'call_plan_1',
            output: 'Plan updated',
          },
        }),
        JSON.stringify({
