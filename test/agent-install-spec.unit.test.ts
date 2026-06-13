import { describe, expect, it } from 'vitest';

import { getAgentInstall, getAgentInstallCommand, getAgentPackage } from '../src/agent/npm.ts';

const NPM_AGENTS: ReadonlyArray<readonly [string, string]> = [
  ['claude', '@anthropic-ai/claude-code'],
  ['codex', '@openai/codex'],
  ['gemini', '@google/gemini-cli'],
];

