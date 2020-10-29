import type { Agent } from './index.js';

const AGENT_PACKAGES: Record<Agent, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  gemini: '@google/gemini-cli',
};

const AGENT_BREW_CASKS: Partial<Record<Agent, string>> = {
  claude: 'claude-code',
  codex: 'codex',
};

const AGENT_LABELS: Record<Agent, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
};

