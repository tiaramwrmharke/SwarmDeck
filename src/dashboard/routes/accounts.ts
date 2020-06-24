import { Hono } from 'hono';
import { allDriverIds } from '../../agent/index.js';
import {
  accountAgentSupported, getAccount, addAccount, updateAccount, removeAccount,
  getActiveAccountId, setActiveAccount, probeAccountUsage, getAccountsUsageSnapshot,
  MAX_ACCOUNTS_PER_AGENT,
  type AgentAccountRecord,
} from '../../agent/accounts.js';
import { invalidateAgentStatus } from './agents.js';

const app = new Hono();

function agentError(agent: string): { status: 400; msg: string } | null {
  if (!allDriverIds().includes(agent)) return { status: 400, msg: `Unknown agent: ${agent}` };
  if (!accountAgentSupported(agent)) return { status: 400, msg: `Agent ${agent} does not support multiple accounts` };
  return null;
}

// Never returns the token — only the display name, usage, and active flag.
async function publicAccount(agent: string, rec: AgentAccountRecord, activeId: string | null) {
  return {
    id: rec.id,
    label: rec.label,
    createdAt: rec.createdAt,
    lastUsedAt: rec.lastUsedAt ?? null,
    active: rec.id === activeId,
    usage: await probeAccountUsage(agent, rec.id),
  };
}

app.get('/api/agents/:agent/accounts', async (c) => {
  const agent = c.req.param('agent');
  if (!allDriverIds().includes(agent)) return c.json({ ok: false, error: `Unknown agent: ${agent}` }, 400);
  if (!accountAgentSupported(agent)) {
    return c.json({ ok: true, agent, supported: false, accounts: [], activeAccountId: null, nativeUsage: null, max: MAX_ACCOUNTS_PER_AGENT });
  }
  // `fresh=1` = the user is actively looking (popover open / panel refresh): re-probe past the
