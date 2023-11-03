import { Hono } from 'hono';
import { execFile } from 'node:child_process';
import {
  addGlobalMcpExtension, removeGlobalMcpExtension, updateGlobalMcpExtension,
  addWorkspaceMcpExtension, removeWorkspaceMcpExtension, updateWorkspaceMcpExtension,
  getCatalogItems, buildInstalledConfigFromRecommended,
  checkMcpHealth, getCachedHealth, cacheHealth,
  getRecommendedMcpServer,
  listSkills, installSkill, removeSkill,
  recordSkillInstall, getSkillLedgerEntry,
  getRecommendedSkillRepos, searchSkillRepos, searchMcpServers,
  startAuthorization, completeAuthorization, deleteMcpToken, getMcpToken,
} from '../../agent/index.js';
import type { McpServerConfig } from '../../core/config/user-config.js';
import { loadUserConfig, saveUserConfig } from '../../core/config/user-config.js';
import { ensurePeekabooWarm } from '../../agent/mcp/bridge.js';
import { runtime } from '../runtime.js';
import path from 'node:path';
import fs from 'node:fs';

function setBuiltinEnabled(catalogId: string, enabled: boolean): boolean {
  if (catalogId === 'swarmdeck-browser') {
    saveUserConfig({ ...loadUserConfig(), browserEnabled: enabled });
    return true;
  }
  if (catalogId === 'peekaboo') {
    saveUserConfig({ ...loadUserConfig(), peekabooEnabled: enabled });
    if (enabled) ensurePeekabooWarm();
    return true;
  }
  return false;
}

const app = new Hono();

function isValidWorkdir(dir: string | undefined | null): dir is string {
  if (!dir || typeof dir !== 'string') return false;
  if (!path.isAbsolute(dir)) return false;
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

function getCallbackRedirectUri(c: { req: { url: string } }): string {
  const origin = new URL(c.req.url).origin;
  return `${origin}/api/extensions/mcp/oauth/callback`;
}

app.get('/api/extensions/mcp/catalog', (c) => {
  const workdir = c.req.query('workdir') || runtime.getRequestWorkdir();
  const scopeParam = c.req.query('scope');
  const scope = scopeParam === 'global' || scopeParam === 'workspace' || scopeParam === 'both'
    ? scopeParam
    : undefined;
  const items = getCatalogItems({ workdir, scope });
  return c.json({ ok: true, items });
});

app.post('/api/extensions/mcp/install', async (c) => {
  try {
    const body = await c.req.json();
    const {
      catalogId,
      scope = 'global',
      workdir: reqWorkdir,
      credentials,
      enable = true,
    } = body as {
      catalogId: string;
      scope?: 'global' | 'workspace';
      workdir?: string;
      credentials?: Record<string, string>;
      enable?: boolean;
    };
    if (!catalogId?.trim()) return c.json({ ok: false, error: 'catalogId is required' }, 400);
    const rec = getRecommendedMcpServer(catalogId.trim());
    if (!rec) return c.json({ ok: false, error: `unknown catalogId: ${catalogId}` }, 404);
    if (rec.isBuiltin) {
      const ok = setBuiltinEnabled(rec.id, enable !== false);
      return c.json({ ok, enabled: ok && enable !== false });
    }

    let shouldEnable = enable;
    if (rec.auth.type === 'mcp-oauth' && !getMcpToken(rec.id)) shouldEnable = false;
    if (rec.auth.type === 'credentials') {
      for (const f of rec.auth.fields) {
        if (f.required && !(credentials || {})[f.key]?.trim()) {
          shouldEnable = false;
          break;
        }
      }
    }

    const config = buildInstalledConfigFromRecommended(rec, { enabled: shouldEnable, credentials });

    if (scope === 'workspace') {
      const wd = reqWorkdir || runtime.getRequestWorkdir();
      if (!isValidWorkdir(wd)) return c.json({ ok: false, error: 'valid workdir is required for workspace scope' }, 400);
      addWorkspaceMcpExtension(wd, rec.id, config);
    } else {
      addGlobalMcpExtension(rec.id, config);
    }
    return c.json({ ok: true, enabled: shouldEnable });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.post('/api/extensions/mcp/toggle', async (c) => {
  try {
    const body = await c.req.json();
    const { name, enabled, scope = 'global', workdir: reqWorkdir } = body as {
      name: string;
      enabled: boolean;
      scope?: 'global' | 'workspace';
      workdir?: string;
    };
    if (!name?.trim()) return c.json({ ok: false, error: 'name is required' }, 400);

    if (setBuiltinEnabled(name.trim(), !!enabled)) {
      return c.json({ ok: true, updated: true });
    }

    const patch: Partial<McpServerConfig> = { enabled: !!enabled };
    let updated: boolean;
    if (scope === 'workspace') {
      const wd = reqWorkdir || runtime.getRequestWorkdir();
      if (!isValidWorkdir(wd)) return c.json({ ok: false, error: 'valid workdir is required' }, 400);
      updated = updateWorkspaceMcpExtension(wd, name.trim(), patch);
    } else {
      updated = updateGlobalMcpExtension(name.trim(), patch);
    }
    return c.json({ ok: true, updated });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.post('/api/extensions/mcp/update', async (c) => {
  try {
    const body = await c.req.json();
    const { name, patch, scope = 'global', workdir: reqWorkdir } = body as {
      name: string;
      patch: Partial<McpServerConfig>;
      scope?: 'global' | 'workspace';
      workdir?: string;
    };
    if (!name?.trim()) return c.json({ ok: false, error: 'name is required' }, 400);

    let updated: boolean;
    if (scope === 'workspace') {
      const wd = reqWorkdir || runtime.getRequestWorkdir();
      if (!isValidWorkdir(wd)) return c.json({ ok: false, error: 'valid workdir is required' }, 400);
      updated = updateWorkspaceMcpExtension(wd, name.trim(), patch);
    } else {
      updated = updateGlobalMcpExtension(name.trim(), patch);
    }
    return c.json({ ok: true, updated });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.post('/api/extensions/mcp/remove', async (c) => {
  try {
    const body = await c.req.json();
    const { name, scope = 'global', workdir: reqWorkdir, catalogId } = body as {
      name: string;
      scope?: 'global' | 'workspace';
      workdir?: string;
      catalogId?: string;
    };
    if (!name?.trim()) return c.json({ ok: false, error: 'name is required' }, 400);

    if (setBuiltinEnabled(name.trim(), false)) {
      return c.json({ ok: true, removed: true });
    }

    let removed: boolean;
    if (scope === 'workspace') {
      const wd = reqWorkdir || runtime.getRequestWorkdir();
      if (!isValidWorkdir(wd)) return c.json({ ok: false, error: 'valid workdir is required' }, 400);
      removed = removeWorkspaceMcpExtension(wd, name.trim());
    } else {
      removed = removeGlobalMcpExtension(name.trim());
    }
    if (catalogId) deleteMcpToken(catalogId);
    return c.json({ ok: true, removed });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.post('/api/extensions/mcp/custom', async (c) => {
  try {
    const body = await c.req.json();
    const { name, config, scope = 'global', workdir: reqWorkdir } = body as {
      name: string;
      config: McpServerConfig;
      scope?: 'global' | 'workspace';
      workdir?: string;
    };
    if (!name?.trim()) return c.json({ ok: false, error: 'name is required' }, 400);
    if (!config) return c.json({ ok: false, error: 'config is required' }, 400);

    const clean: McpServerConfig = { ...config };
    delete (clean as any).catalogId;
    if (clean.enabled === undefined) clean.enabled = true;

    if (scope === 'workspace') {
      const wd = reqWorkdir || runtime.getRequestWorkdir();
      if (!isValidWorkdir(wd)) return c.json({ ok: false, error: 'valid workdir is required for workspace scope' }, 400);
      addWorkspaceMcpExtension(wd, name.trim(), clean);
    } else {
      addGlobalMcpExtension(name.trim(), clean);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.post('/api/extensions/mcp/health', async (c) => {
  try {
    const body = await c.req.json();
    const { id, config, noCache } = body as { id: string; config: McpServerConfig; noCache?: boolean };
    if (!id?.trim()) return c.json({ ok: false, error: 'id is required' }, 400);
    if (!config) return c.json({ ok: false, error: 'config is required' }, 400);

    if (!noCache) {
      const cached = getCachedHealth(id, config);
      if (cached) return c.json({ ...cached, cached: true });
    }

    const result = await checkMcpHealth(config);
    cacheHealth(id, config, result);
    return c.json(result);
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'internal error' }, 500);
  }
});

app.get('/api/extensions/mcp/search', async (c) => {
  const query = c.req.query('q') || '';
  const parsed = parseInt(c.req.query('limit') || '20', 10);
  const limit = Math.min(Number.isFinite(parsed) ? parsed : 20, 50);
  try {
    const results = await searchMcpServers(query, limit);
    return c.json({ ok: true, results });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message, results: [] });
