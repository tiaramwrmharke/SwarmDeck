import { describe, expect, it } from 'vitest';

import { resolveDefaultAgent } from '../src/agent/index.ts';
import type { AgentInfo } from '../src/agent/index.ts';

function info(agent: AgentInfo['agent'], installed: boolean): AgentInfo {
  return { agent, installed, path: installed ? `/usr/bin/${agent}` : null, version: null };
}

const ALL_INSTALLED: AgentInfo[] = [
  info('claude', true), info('codex', true), info('gemini', true), info('hermes', true),
];
const ONLY_CLAUDE: AgentInfo[] = [
