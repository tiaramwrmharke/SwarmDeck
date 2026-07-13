import {
  forceCloseManagedBrowser,
  getConfiguredRemoteCdpUrl,
  getManagedBrowserProfileDir,
  prepareManagedBrowserForAutomation,
} from './browser-profile.js';
import { PIKILOOM_BROWSER_CDP_URL_ENV } from './core/constants.js';
import { writeScopedLog } from './core/logging.js';

export type ManagedBrowserConnectionMode = 'attach' | 'launch' | 'unavailable';

export interface ManagedBrowserSnapshot {
  cdpEndpoint: string | null;
  connectionMode: ManagedBrowserConnectionMode;
}

export interface EnsureManagedBrowserOptions {
  headless?: boolean;
  force?: boolean;
}

interface CachedState {
  cdpEndpoint: string | null;
  connectionMode: ManagedBrowserConnectionMode;
  validatedAt: number;
}

const HEALTH_CACHE_MS = 30_000;
const CDP_PROBE_TIMEOUT_MS = 1_500;

let cached: CachedState | null = null;
let inflight: Promise<ManagedBrowserSnapshot> | null = null;

function log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'debug'): void {
  writeScopedLog('browser-supervisor', message, { level, stream: 'stderr' });
}

const getRemoteCdpUrl = getConfiguredRemoteCdpUrl;

async function snapshotRemote(remoteUrl: string, now: number): Promise<ManagedBrowserSnapshot> {
  if (cached?.cdpEndpoint === remoteUrl && now - cached.validatedAt < HEALTH_CACHE_MS) {
    return snapshotFromCache(cached);
  }
  const healthy = await pingCdpEndpoint(remoteUrl);
  if (!healthy) {
    if (cached?.cdpEndpoint === remoteUrl) cached = null;
    log(`remote CDP endpoint ${remoteUrl} not reachable`, 'warn');
    return { cdpEndpoint: null, connectionMode: 'unavailable' };
  }
  cached = { cdpEndpoint: remoteUrl, connectionMode: 'attach', validatedAt: now };
  log(`using remote CDP endpoint ${remoteUrl} (from ${PIKILOOM_BROWSER_CDP_URL_ENV})`);
  return snapshotFromCache(cached);
}

function snapshotFromCache(state: CachedState): ManagedBrowserSnapshot {
  return { cdpEndpoint: state.cdpEndpoint, connectionMode: state.connectionMode };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
