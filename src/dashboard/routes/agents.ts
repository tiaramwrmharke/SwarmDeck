import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getAgentInstall, getAgentInstallCommand, getAgentLabel, getAgentPackage } from '../../agent/npm.js';
import { loadUserConfig, saveUserConfig, applyUserConfig, type UserConfig } from '../../core/config/user-config.js';
import { setAgentBoundModelId, type AgentDetectOptions, type UsageResult } from '../../agent/index.js';
import { getAgentUpdateState, checkAgentLatestVersion, manualAgentUpdate } from '../../agent/auto-update.js';
import type { Agent } from '../../agent/index.js';
import { getDriver, getDriverCapabilities } from '../../agent/driver.js';
import { splitEffortForAgent, effortOptionsFor } from '../../core/config/runtime-config.js';
import {
  getActiveProfile, getProvider,
  peekProviderModelList, prefetchProviderModels,
} from '../../model/index.js';
import { DASHBOARD_TIMEOUTS } from '../../core/constants.js';
import { withTimeoutFallback } from '../../core/utils.js';
import { runtime } from '../runtime.js';

const AGENT_STATUS_MODELS_TIMEOUT_MS = DASHBOARD_TIMEOUTS.agentStatusModels;
const AGENT_STATUS_USAGE_TIMEOUT_MS = DASHBOARD_TIMEOUTS.agentStatusUsage;
const AGENT_STATUS_CACHE_TTL_MS = DASHBOARD_TIMEOUTS.agentStatusCacheTtl;
const AGENT_INSTALL_TIMEOUT_MS = DASHBOARD_TIMEOUTS.agentInstall;

function dedupeModels(models: { id: string; alias: string | null }[]): { id: string; alias: string | null }[] {
  const seen = new Set<string>();
  const deduped: { id: string; alias: string | null }[] = [];
  for (const model of models) {
    const id = String(model?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, alias: model.alias?.trim() || null });
  }
  return deduped;
}

function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string; error: string | null }> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, npm_config_yes: 'true' },
    });
    const timeoutMs = Math.max(500, opts.timeoutMs ?? DASHBOARD_TIMEOUTS.runCommand);
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      resolve({ ok: false, stdout, stderr, error: `Timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);

    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('error', err => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, error: err.message });
    });
    child.on('close', code => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        error: code === 0 ? null : (stderr.trim() || stdout.trim() || `Exited with code ${code}`),
      });
    });
  });
}

function cleanupNpmStagingFromError(stderr: string): string[] {
  const removed: string[] = [];
  const re = /rename\s+'([^']+)'\s+->\s+'([^']+)'/g;
  const candidates = new Set<string>();
  for (let m: RegExpExecArray | null; (m = re.exec(stderr));) {
    candidates.add(m[1]);
    candidates.add(m[2]);
  }
  for (const p of candidates) {
    const base = path.basename(p);
    if (!base.startsWith('.')) continue;
    try {
      fs.rmSync(p, { recursive: true, force: true });
      removed.push(p);
    } catch {  }
  }
  return removed;
}

async function installAgentViaNpm(agent: Agent, log: (msg: string) => void): Promise<void> {
  const spec = getAgentInstall(agent);
  if (!spec) throw new Error(`Unknown agent: ${agent}`);
  if (spec.method !== 'npm') {
    const docs = spec.docsUrl ? ` See ${spec.docsUrl}.` : '';
    throw new Error(
      `${getAgentLabel(agent)} can't be installed automatically — run it yourself: ${spec.command}.${docs}`,
    );
  }
  const pkg = getAgentPackage(agent)!;
  log(`Installing ${getAgentLabel(agent)} via npm...`);
  let result = await runCommand('npm', ['install', '-g', `${pkg}@latest`], {
    timeoutMs: AGENT_INSTALL_TIMEOUT_MS,
  });
  if (!result.ok && /ENOTEMPTY/.test(result.stderr)) {
    const removed = cleanupNpmStagingFromError(result.stderr);
