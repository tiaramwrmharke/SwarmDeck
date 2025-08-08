import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import {
  MANAGED_BROWSER_PROFILE_SUBPATH,
  MANAGED_BROWSER_STEALTH_ARGS,
  PIKILOOM_BROWSER_CDP_URL_ENV,
  PLAYWRIGHT_MCP_PACKAGE_NAME,
  PLAYWRIGHT_MCP_PACKAGE_SPEC,
  PLAYWRIGHT_MCP_BROWSER_ARGS,
} from './core/constants.js';

export type ManagedBrowserProfileStatus = 'ready' | 'needs_setup' | 'chrome_missing';

export interface ManagedBrowserStatus {
  status: ManagedBrowserProfileStatus;
  profileDir: string;
  profileCreated: boolean;
  chromeInstalled: boolean;
  running: boolean;
  pid: number | null;
  detail: string | null;
  chromeExecutable: string | null;
  launchCommand: string[];
}

export interface ManagedBrowserLaunchResult extends ManagedBrowserStatus {
  pid: number | null;
}

export interface ManagedBrowserAutomationPreparationResult {
  profileDir: string;
  closedPids: number[];
  cdpEndpoint: string | null;
  connectionMode: 'attach' | 'launch';
}

export interface ManagedBrowserAutomationOptions {
  headless?: boolean;
}

export interface ManagedBrowserMcpCommand {
  command: string;
  args: string[];
  source: 'local' | 'npx';
}

export interface ManagedBrowserMcpOptions {
  headless?: boolean;
  cdpEndpoint?: string | null;
}

interface ManagedBrowserSetupState {
  pid: number;
  profileDir: string;
  chromeExecutable: string;
  launchedAt: string;
}

const MANAGED_BROWSER_SETUP_STATE_FILENAME = 'managed-browser-setup.json';
const MANAGED_BROWSER_SHUTDOWN_TIMEOUT_MS = 5_000;
const MANAGED_BROWSER_SHUTDOWN_POLL_MS = 100;
const require = createRequire(import.meta.url);

function readDevToolsActivePort(profileDir: string): number | null {
  try {
    const raw = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
    const firstLine = raw.split('\n')[0]?.trim();
    if (!firstLine) return null;
    const port = parseInt(firstLine, 10);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return port;
  } catch {
    return null;
  }
}

function normalizeBrowserCdpEndpoint(endpoint: string): string {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export function getConfiguredRemoteCdpUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = String(env[PIKILOOM_BROWSER_CDP_URL_ENV] || '').trim();
  if (!raw) return null;
  return normalizeBrowserCdpEndpoint(raw);
}

async function resolveBrowserCdpEndpoint(endpoint: string): Promise<string | null> {
  const normalizedEndpoint = normalizeBrowserCdpEndpoint(endpoint);
  if (!normalizedEndpoint) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`${normalizedEndpoint}/json/version`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { webSocketDebuggerUrl?: unknown } | null;
    return typeof payload?.webSocketDebuggerUrl === 'string' ? normalizedEndpoint : null;
  } catch {
