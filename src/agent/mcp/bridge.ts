import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ensurePlaywrightMcpConfigFile,
  getConfiguredRemoteCdpUrl,
  getManagedBrowserProfileDir,
  resolveManagedBrowserCdpEndpoint,
  resolveManagedBrowserMcpCommand,
} from '../../browser-profile.js';
import { loadUserConfig } from '../../core/config/user-config.js';
import { MCP_TIMEOUTS, MCP_ARTIFACT_MAX_BYTES } from '../../core/constants.js';
import type { AgentInteraction, AgentInteractionQuestion } from '../types.js';
import { mergeExtensionsForSession, getGlobalExtensionsAsServers } from './extensions.js';

export interface McpSendFileOpts {
  caption?: string;
  kind?: 'photo' | 'document';
}

export interface McpSendFileResult {
  ok: boolean;
  error?: string;
}

export type McpSendFileCallback = (
  filePath: string,
  opts: McpSendFileOpts,
) => Promise<McpSendFileResult>;

export type AskUserCallback = (
  request: AgentInteraction,
) => Promise<Record<string, any> | null>;

export interface McpBridgeHandle {
  configPath: string;
  extraEnv?: Record<string, string>;
  mcpServers?: Record<string, any>;
  hadActivity: () => boolean;
  stop: () => Promise<void>;
}

export interface McpBridgeOpts {
  sessionDir: string;
  workspacePath: string;
  workdir?: string;
  stagedFiles: string[];
  sendFile?: McpSendFileCallback;
  onInteraction?: AskUserCallback;
  agent?: string;
  onLog?: (message: string) => void;
}

interface McpServerRuntimeInfo {
  execPath: string;
  execArgv: string[];
  argv: string[];
  moduleUrl: string;
}

interface RegisteredMcpServer {
  name: string;
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface GuiIntegrationConfig {
  browserEnabled: boolean;
  browserProfileDir: string;
  browserHeadless: boolean;
  peekabooEnabled: boolean;
}

function sanitizeExecArgv(execArgv: string[]): string[] {
  return execArgv.filter(arg => !/^--inspect(?:-brk)?(?:=.*)?$/.test(arg));
}

function resolveCurrentCliCommand(
  runtime: McpServerRuntimeInfo,
  extraArgs: string[],
): { command: string; args: string[] } | null {
  const entryScript = runtime.argv[1] ? path.resolve(runtime.argv[1]) : '';
  const base = path.basename(entryScript).toLowerCase();
  if (!entryScript || !fs.existsSync(entryScript)) return null;
  if (base !== 'main.js' && base !== 'main.ts' && base !== 'cli.js' && base !== 'cli.ts') return null;
  return {
    command: runtime.execPath,
    args: [...sanitizeExecArgv(runtime.execArgv), entryScript, ...extraArgs],
  };
}

export function resolveMcpServerCommand(runtime: McpServerRuntimeInfo = {
  execPath: process.execPath,
  execArgv: process.execArgv,
  argv: process.argv,
  moduleUrl: import.meta.url,
}): { command: string; args: string[] } {
  const currentProcess = resolveCurrentCliCommand(runtime, ['--mcp-serve']);
  if (currentProcess) return currentProcess;

  const thisDir = path.dirname(fileURLToPath(runtime.moduleUrl));
  const serverScript = path.join(thisDir, 'session-server.js');
  if (fs.existsSync(serverScript)) {
    return { command: 'node', args: [serverScript] };
  }
  const cliScript = path.resolve(thisDir, '../../cli/main.js');
  if (fs.existsSync(cliScript)) {
    return { command: 'node', args: [cliScript, '--mcp-serve'] };
  }
  return { command: 'swarmdeck', args: ['--mcp-serve'] };
}

function parseOptionalBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return null;
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return null;
}

function boolFromConfigEnv(configValue: unknown, envValue: unknown, fallback: boolean): boolean {
  const envParsed = parseOptionalBool(envValue);
  if (envParsed != null) return envParsed;
  const configParsed = parseOptionalBool(configValue);
  if (configParsed != null) return configParsed;
  return fallback;
}

export function resolveGuiIntegrationConfig(
  config = loadUserConfig(),
  env: Record<string, string | undefined> = process.env,
): GuiIntegrationConfig {
  const browserEnabled = boolFromConfigEnv(
    typeof config.browserEnabled === 'boolean' ? config.browserEnabled : (config as Record<string, unknown>).browserUseProfile,
    env.PIKILOOM_BROWSER_ENABLED ?? env.PIKILOOM_BROWSER_USE_PROFILE,
    !!getConfiguredRemoteCdpUrl(env),
  );
  const peekabooEnabled = boolFromConfigEnv(
    config.peekabooEnabled,
    env.PIKILOOM_PEEKABOO_ENABLED,
    false,
  );
  return {
    browserEnabled,
    browserProfileDir: getManagedBrowserProfileDir(),
    browserHeadless: boolFromConfigEnv(config.browserHeadless, env.PIKILOOM_BROWSER_HEADLESS, false),
    peekabooEnabled,
  };
}

export interface BrowserSupervisorEndpoints {
  cdpEndpoint?: string | null;
}

export const PEEKABOO_NPX_PACKAGE = '@steipete/peekaboo';
export const PEEKABOO_MCP_ARGV = ['-y', '-p', PEEKABOO_NPX_PACKAGE, 'peekaboo-mcp'];
export const PEEKABOO_WARM_ARGV = ['-y', '-p', PEEKABOO_NPX_PACKAGE, 'peekaboo', '--version'];

let peekabooWarmStarted = false;

const PEEKABOO_ENV_ALLOWLIST = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
] as const;
const PEEKABOO_DEFAULT_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

function cleanEnvString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('\0')) return null;
  return trimmed;
}

export function buildPeekabooChildEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of PEEKABOO_ENV_ALLOWLIST) {
    const value = cleanEnvString(env[key]);
    if (value) safe[key] = value;
  }
  safe.PATH ||= PEEKABOO_DEFAULT_PATH;
  safe.HOME ||= os.homedir();
  safe.PIKILOOM_MCP_SERVER = 'peekaboo';
  safe.npm_config_yes = 'true';
  return safe;
}

function peekabooEnvArgs(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

function buildPeekabooMcpServer(): RegisteredMcpServer {
  const safeEnv = buildPeekabooChildEnv();
  return {
    name: 'peekaboo',
    command: '/usr/bin/env',
    args: ['-i', ...peekabooEnvArgs(safeEnv), 'npx', ...PEEKABOO_MCP_ARGV],
  };
}

export function ensurePeekabooWarm(): void {
  if (process.platform !== 'darwin' || peekabooWarmStarted) return;
  peekabooWarmStarted = true;
  try {
    const child = spawn('npx', PEEKABOO_WARM_ARGV, {
      stdio: 'ignore',
      detached: true,
      env: buildPeekabooChildEnv(),
    });
    child.on('error', () => { peekabooWarmStarted = false; });
    child.unref();
  } catch {
    peekabooWarmStarted = false;
  }
}

export function buildSupplementalMcpServers(
  gui: GuiIntegrationConfig = resolveGuiIntegrationConfig(),
  endpoints: BrowserSupervisorEndpoints = {},
): RegisteredMcpServer[] {
  const servers: RegisteredMcpServer[] = [];
  if (gui.browserEnabled) {
    const profileDir = gui.browserProfileDir || getManagedBrowserProfileDir();
    const cdpEndpoint = (endpoints.cdpEndpoint || '').trim() || null;
    const browserServer = resolveManagedBrowserMcpCommand(profileDir, {
      headless: gui.browserHeadless,
      cdpEndpoint,
    });
    servers.push({
      name: 'swarmdeck-browser',
      command: browserServer.command,
      args: browserServer.args,
    });
  }
  if (gui.peekabooEnabled && process.platform === 'darwin') {
    servers.push(buildPeekabooMcpServer());
  }
  return servers;
}

export function buildGuiSetupHints(gui: GuiIntegrationConfig = resolveGuiIntegrationConfig()): string[] {
  const hints: string[] = [];
  if (gui.browserEnabled) {
    hints.push(
      `managed browser profile mode enabled; runtime sessions reuse ${gui.browserProfileDir || getManagedBrowserProfileDir()}; configured MCP browser mode=${gui.browserHeadless ? 'headless' : 'headed'}. This mode keeps automation isolated from your everyday browser. If the managed browser is already open, swarmdeck will try to attach to it first. When using browser_tabs, use action="new" to open a tab, not "create".`,
    );
  }
  if (gui.peekabooEnabled && process.platform === 'darwin') {
    hints.push(
      'Peekaboo enabled — native macOS GUI tools (see / click / type / scroll / window / menu / app / dock) via Accessibility + ScreenCaptureKit. Prefer element-ID interactions (call `see` first) over raw coordinates.',
    );
  }
  return hints;
}

function buildClaudeMcpConfig(servers: RegisteredMcpServer[]) {
  return {
    mcpServers: Object.fromEntries(servers.map(server => [
