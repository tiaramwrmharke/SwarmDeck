#!/usr/bin/env npx tsx

import fs from 'node:fs';
import { Bot } from '../src/bot/bot.ts';
import { startDashboard, type DashboardServer } from '../src/dashboard/server.ts';
import type { AgentInteraction, StreamResult } from '../src/agent/index.ts';

const TMP = '/tmp/swarmdeck-e2e-interaction';
fs.mkdirSync(`${TMP}/workdir`, { recursive: true });
fs.writeFileSync(`${TMP}/setting.json`, '{}');
process.env.PIKILOOM_CONFIG = `${TMP}/setting.json`;
process.env.PIKILOOM_WORKDIR = `${TMP}/workdir`;
process.env.DEFAULT_AGENT = 'codex';

class TestBot extends Bot {
  async runStream(...args: Parameters<Bot['runStream']>): Promise<StreamResult> {
    const [prompt, cs, attachments, onText, _sp, _mcp, _abort, onInteraction] = args;

    if (!onInteraction) {
      return super.runStream(...args);
    }

    console.log('\n🤖 [Agent] Simulating human-in-the-loop: asking user to choose...');

    const interaction: AgentInteraction = {
      kind: 'permission',
      id: 'demo-req-1',
      title: 'Tool Permission Required',
