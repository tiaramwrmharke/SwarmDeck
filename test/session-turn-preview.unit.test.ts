import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLastSessionTurn } from '../src/bot/commands.ts';
import { getSessionTail } from '../src/agent/index.ts';
import { withTempHome } from './support/env.ts';

// Regression suite for the IM session-selection preview ("Recent Context") showing a raw
// harness-injected <task-notification> record instead of the user's actual question.

const TASK_NOTIFICATION = [
  '<task-notification>',
  '<task-id>a9e6baa2fb0728355</task-id>',
  '<tool-use-id>toolu_013VEgMTbMgStg3PNb2taGtQ</tool-use-id>',
  '<output-file>/private/tmp/claude-501/tasks/a9e6baa2fb0728355.output</output-file>',
  '<status>completed</status>',
  '<summary>Agent "Map swarmdeck server-side src/" finished</summary>',
  '<note>A task-notification fires each time this agent stops.</note>',
  '</task-notification>',
].join('\n');

describe('extractLastSessionTurn', () => {
  it('anchors on the real user question, not a trailing harness-injected record', () => {
    const turn = extractLastSessionTurn([
      { role: 'user', text: '帮我梳理一下 server-side src 的结构' },
      { role: 'assistant', text: '好的，我起了一个后台 agent 来梳理。' },
      { role: 'user', text: TASK_NOTIFICATION },
      { role: 'assistant', text: '梳理完成：src 分为 core/agent/bot/channels 四层。' },
    ]);
