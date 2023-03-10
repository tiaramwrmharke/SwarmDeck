import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cfgRef } = vi.hoisted(() => ({ cfgRef: { value: { version: 1 } as Record<string, unknown> } }));
vi.mock('../src/core/config/user-config.js', () => ({ loadUserConfig: () => cfgRef.value }));
vi.mock('../src/core/logging.js', () => ({ writeScopedLog: () => {} }));

import {
  resolveIceServers,
  getCachedIceServers,
  toWeriftIceServers,
  resolveTurnConfig,
  turnStatus,
  prewarmTurn,
  __resetTurnCacheForTest,
  type IceServer,
} from '../src/pikichannel/turn.js';

const CF_RESPONSE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'cf-user',
      credential: 'cf-cred',
    },
  ],
};

const STUN_ONLY: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const TURN_ENV = ['PIKICHANNEL_TURN_KEY_ID', 'PIKICHANNEL_TURN_API_TOKEN', 'PIKICHANNEL_TURN_TTL', 'PIKICHANNEL_ICE_SERVERS'];
const savedEnv: Record<string, string | undefined> = {};

function okFetch(body: unknown, status = 201) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

beforeEach(() => {
  __resetTurnCacheForTest();
  cfgRef.value = { version: 1 };
  for (const k of TURN_ENV) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});
