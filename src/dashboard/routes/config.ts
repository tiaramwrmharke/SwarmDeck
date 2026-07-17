import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadUserConfig, saveUserConfig, applyUserConfig, hasUserConfigFile } from '../../core/config/user-config.js';
import { expandTilde, whichSync } from '../../core/platform.js';
import { readGitStatus } from '../../core/git.js';
import { isSetupReady } from '../../cli/onboarding.js';
import {
  validateDingtalkConfig,
  validateDiscordConfig,
  validateFeishuConfig,
  validateSlackConfig,
  validateTelegramConfig,
  validateWecomConfig,
  validateWeixinConfig,
} from '../../core/config/validation.js';
import { resolveGuiIntegrationConfig } from '../../agent/mcp/bridge.js';
import {
  normalizeWeixinBaseUrl,
  startWeixinQrLogin,
  waitForWeixinQrLogin,
} from '../../channels/weixin/api.js';
import {
  getConfiguredRemoteCdpUrl,
  getManagedBrowserStatus,
  launchManagedBrowserSetup,
} from '../../browser-profile.js';
import {
  requestProcessRestart,
} from '../../core/process-control.js';
import {
  getPermissionsStatus,
  getHostTerminalApp,
  isValidPermissionKey,
  requestPermission,
} from '../platform.js';
import { VERSION } from '../../core/version.js';
import { runtime } from '../runtime.js';
import { writeScopedLog } from '../../core/logging.js';

export async function buildBrowserStatusResponse(config = loadUserConfig(), browserState = getManagedBrowserStatus()) {
  const gui = resolveGuiIntegrationConfig(config);
  const remoteCdpUrl = gui.browserEnabled ? getConfiguredRemoteCdpUrl() : null;
  return {
    browser: {
      status: gui.browserEnabled ? browserState.status : 'disabled',
      enabled: gui.browserEnabled,
      remoteCdpUrl,
      headlessMode: gui.browserHeadless ? 'headless' : 'headed',
      chromeInstalled: browserState.chromeInstalled,
      profileCreated: browserState.profileCreated,
      running: browserState.running,
      pid: browserState.pid,
      profileDir: browserState.profileDir || gui.browserProfileDir,
      detail: !gui.browserEnabled
        ? 'Browser automation is disabled. No browser MCP server will be injected into agent sessions. On macOS, operate your main browser directly with open, osascript, and screencapture when needed.'
        : remoteCdpUrl
          ? `Attached to an external Chrome over CDP at ${remoteCdpUrl} (PIKILOOM_BROWSER_CDP_URL). swarmdeck does not launch or manage a local browser in this mode — sign in to sites from the Chrome that owns this endpoint (e.g. your sidecar's web VNC).`
          : browserState.detail,
    },
  };
}

type OpenTarget = 'vscode' | 'cursor' | 'windsurf' | 'finder' | 'default';

function isOpenTarget(value: unknown): value is OpenTarget {
  return value === 'vscode'
    || value === 'cursor'
    || value === 'windsurf'
    || value === 'finder'
    || value === 'default';
}

function runOpenCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 0) !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `Failed to run ${command} ${args.join(' ')}`);
  }
}

export interface ResolvedOpenPath {
  filePath: string;
  line: number | null;
  column: number | null;
}

function stripOpenPathWrapping(value: string): string {
  let text = value.trim();
  const pairs: Array<[string, string]> = [['`', '`'], ['"', '"'], ["'", "'"], ['<', '>']];
  let changed = true;
  while (changed && text.length >= 2) {
    changed = false;
    for (const [left, right] of pairs) {
      if (text.startsWith(left) && text.endsWith(right)) {
        text = text.slice(left.length, -right.length).trim();
        changed = true;
      }
    }
  }
  return text;
}

function decodeOpenPathInput(raw: string): string {
  const text = stripOpenPathWrapping(raw);
  if (text.startsWith('file://')) {
    try { return fileURLToPath(text); } catch { return decodeURI(text.slice('file://'.length)); }
  }
  if (text.startsWith('vscode://file/')) {
    return decodeURI(`/${text.slice('vscode://file/'.length)}`);
  }
  return text;
}

function resolveOpenBasePath(basePath?: string | null): string {
  const base = typeof basePath === 'string' && basePath.trim()
    ? basePath.trim()
    : runtime.getRuntimeWorkdir(loadUserConfig());
  return path.resolve(expandTilde(base || process.cwd()));
}

function splitExistingLineSuffix(candidate: string): ResolvedOpenPath {
  const normalized = path.normalize(candidate);
  if (fs.existsSync(normalized)) return { filePath: normalized, line: null, column: null };

  const match = /^(.*?)(?::(\d+)(?::(\d+))?)$/.exec(normalized);
  if (!match || !match[1]) return { filePath: normalized, line: null, column: null };

  const filePath = path.normalize(match[1]);
  if (!fs.existsSync(filePath)) return { filePath: normalized, line: null, column: null };

  return {
    filePath,
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : null,
  };
}

export function resolveOpenPathLocator(rawPath: string, basePath?: string | null): ResolvedOpenPath {
  const decoded = decodeOpenPathInput(rawPath);
  const expanded = expandTilde(decoded);
  const absolute = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(resolveOpenBasePath(basePath), expanded);
  return splitExistingLineSuffix(absolute);
}

function editorGotoArg(filePath: string, location?: Pick<ResolvedOpenPath, 'line' | 'column'> | null): string | null {
  if (!location?.line) return null;
  return `${filePath}:${location.line}${location.column ? `:${location.column}` : ''}`;
}

function tryOpenCommand(command: string, args: string[]): boolean {
  if (!whichSync(command)) return false;
  try {
    runOpenCommand(command, args);
    return true;
