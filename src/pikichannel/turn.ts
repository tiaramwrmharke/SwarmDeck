import { loadUserConfig } from '../core/config/user-config.js';
import { writeScopedLog } from '../core/logging.js';

const tlog = (msg: string) => writeScopedLog('pikichannel', `[turn] ${msg}`, { level: 'info' });

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface TurnConfig {
  keyId: string;
  apiToken: string;
  ttl: number;
}

const DEFAULT_TTL = 86_400;
const MIN_TTL = 600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MINT_TIMEOUT_MS = 8_000;
const CF_ENDPOINT = (keyId: string) =>
  `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

const DEFAULT_STUN: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

interface CacheEntry {
  key: string;
  servers: IceServer[];
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let pending: Promise<void> | null = null;

export function resolveTurnConfig(): TurnConfig {
  const cfg = loadUserConfig();
  const keyId = String(process.env.PIKICHANNEL_TURN_KEY_ID || cfg.pikichannelTurnKeyId || '').trim();
  const apiToken = String(process.env.PIKICHANNEL_TURN_API_TOKEN || cfg.pikichannelTurnApiToken || '').trim();
  const ttlRaw = process.env.PIKICHANNEL_TURN_TTL || (cfg.pikichannelTurnTtl != null ? String(cfg.pikichannelTurnTtl) : '');
  const ttl = Math.max(MIN_TTL, Number.parseInt(ttlRaw, 10) || DEFAULT_TTL);
  return { keyId, apiToken, ttl };
}

function manualIceServers(): IceServer[] | null {
  const raw = process.env.PIKICHANNEL_ICE_SERVERS;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length) return flatten(v as Array<{ urls: string | string[]; username?: string; credential?: string }>);
  } catch {  }
  return null;
}

function flatten(servers: Array<{ urls: string | string[]; username?: string; credential?: string }>): IceServer[] {
  const out: IceServer[] = [];
  for (const s of servers) {
    if (!s || !s.urls) continue;
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    for (const u of urls) {
      if (typeof u !== 'string' || !u) continue;
      const entry: IceServer = { urls: u };
