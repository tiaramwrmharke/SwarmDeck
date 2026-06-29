import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import {
  getCliCatalog, refreshCliStatus,
  startCliAuthSession, getAuthSession, cancelAuthSession,
  applyCliToken, logoutCli,
  startCliInstallSession,
  type AuthSessionEvent,
} from '../../agent/index.js';

const app = new Hono();

app.get('/api/extensions/cli/catalog', async (c) => {
  try {
    const items = await getCliCatalog();
    return c.json({ ok: true, items });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'catalog failed', items: [] }, 500);
  }
});

app.post('/api/extensions/cli/refresh', async (c) => {
  try {
    const { id } = await c.req.json() as { id: string };
    if (!id?.trim()) return c.json({ ok: false, error: 'id is required' }, 400);
    const status = await refreshCliStatus(id.trim());
    if (!status) return c.json({ ok: false, error: `unknown cli: ${id}` }, 404);
    return c.json({ ok: true, status });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'refresh failed' }, 500);
  }
});

app.post('/api/extensions/cli/auth/start', async (c) => {
  try {
    const { id } = await c.req.json() as { id: string };
    if (!id?.trim()) return c.json({ ok: false, error: 'id is required' }, 400);
    const result = await startCliAuthSession(id.trim());
    if (!result.ok) return c.json(result, 400);
