import { describe, expect, it } from 'vitest';
import {
  decodeCommandAction,
  encodeCommandAction,
  type CommandAction,
} from '../src/bot/command-ui.ts';

describe('CommandAction codec', () => {
  const samples: CommandAction[] = [
    { kind: 'sessions.page', page: 0 },
    { kind: 'sessions.page', page: 7 },
    { kind: 'session.new' },
    { kind: 'session.switch', sessionId: 'abc-123-def' },
    { kind: 'agent.switch', agent: 'claude' },
    { kind: 'agent.switch', agent: 'codex' },
    { kind: 'agent.switch', agent: 'gemini' },
    { kind: 'agent.switch', agent: 'hermes' },
    { kind: 'agent.account.set', agent: 'claude', accountId: 'c0f32fdb' },
    { kind: 'agent.account.set', agent: 'claude', accountId: null },
    { kind: 'model.switch', modelId: 'claude-opus-4-7' },
    { kind: 'effort.set', effort: 'xhigh' },
    { kind: 'models.select.model', modelId: 'gpt-5', profileId: null },
    { kind: 'models.select.model', modelId: 'gpt-5', profileId: 'prof-xyz-1' },
    { kind: 'models.select.effort', effort: 'medium' },
    { kind: 'models.confirm' },
    { kind: 'skill.run', command: 'sk_review' },
