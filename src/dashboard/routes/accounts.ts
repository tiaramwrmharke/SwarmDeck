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
  // short fresh window. The min-interval debounce lives in the driver caches, so this is safe to
  // send on every hover. Account rows and the default-login quota come from the same pass.
  // `force=1` = the user clicked the explicit refresh button: also bypass the failure backoff.
  // Must only ever come from a deliberate click, never a hover — the endpoints behind it
  // rate-limit aggressive polling.
  const fresh = c.req.query('fresh') === '1';
  const force = c.req.query('force') === '1';
  const snap = await getAccountsUsageSnapshot(agent, { fresh, force });
  return c.json({
    ok: true, agent, supported: true,
    accounts: snap.accounts,
    activeAccountId: snap.activeAccountId,
    nativeUsage: snap.native,
    max: MAX_ACCOUNTS_PER_AGENT,
  });
});

app.post('/api/agents/:agent/accounts', async (c) => {
  const agent = c.req.param('agent');
  const err = agentError(agent);
