import { describe, expect, it } from 'vitest';
import { formatSessionsDigestText, type SessionsDigestData } from '../src/bot/commands.ts';

describe('formatSessionsDigestText', () => {
  it('returns an empty-workspace hint when there are no sessions', () => {
    const data: SessionsDigestData = {
      workspaceName: 'demo-app',
      agentTotals: {},
      total: 0,
      entries: [],
    };
    expect(formatSessionsDigestText(data)).toContain('No sessions in demo-app');
  });

  it('renders recent sessions with agent totals and switch hints', () => {
    const data: SessionsDigestData = {
      workspaceName: 'demo-app',
      agentTotals: { codex: 2, claude: 1 },
      total: 3,
      entries: [
        {
          index: 1,
          agent: 'codex',
