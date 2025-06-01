import type http from 'node:http';
import type internal from 'node:stream';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { writeScopedLog } from '../core/logging.js';
import { loadUserConfig, updateUserConfig } from '../core/config/user-config.js';
import { PikichannelHost } from './host.js';
import { prewarmTurn, turnStatus } from './turn.js';
import { SwarmDeckSessionSource, type RequestForwarder } from './adapter-swarmdeck.js';
import { WebSocketTransport } from './transports/websocket-host.js';
import { RendezvousBroker } from './rendezvous-broker.js';
import type { RendezvousHostClient } from './rendezvous-host.js';
import type { ChannelConnection, ChannelTransport } from './transport.js';

export interface PikichannelHandle {
  handleUpgrade(req: http.IncomingMessage, socket: internal.Duplex, head: Buffer): boolean;
  status(): {
    ok: boolean; transports: string[]; peers: number; authedPeers: number;
    webrtc: boolean; webrtcError: string | null; authRequired: boolean; strict: boolean;
    nodeId: string; rendezvous: string | null; publicHost: string | null; registered: boolean; broker: { hosts: number; sessions: number };
    turn: { turn: boolean; provider: 'cloudflare' | 'manual' | null; relay: boolean; expiresAt: number | null };
  };
  stop(): void;
}

function isLoopback(remote: string | undefined): boolean {
  if (!remote) return false;
  const r = remote.toLowerCase();
  return r.startsWith('127.') || r.includes('127.0.0.1') || r === '::1' || r.startsWith('::1:') || r.startsWith('[::1]') || r.includes('::ffff:127.');
}

function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface WsLikeTransport extends ChannelTransport {
  handleUpgrade(req: http.IncomingMessage, socket: internal.Duplex, head: Buffer): void;
}

function readWebAsset(name: string): string {
  const file = path.join(import.meta.dirname, 'web', name);
  return fs.readFileSync(file, 'utf8');
}

export async function mountPikichannel(app: Hono): Promise<PikichannelHandle> {
  const log = (msg: string) => writeScopedLog('pikichannel', msg, { level: 'info' });

  const cfg = loadUserConfig();
  const envToken = String(process.env.PIKICHANNEL_TOKEN || '').trim();
  let token = envToken || String(cfg.pikichannelToken || '').trim();
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    try { updateUserConfig({ pikichannelToken: token }); log('provisioned a new pikichannel access token'); }
    catch (err) { log(`could not persist access token: ${(err as Error)?.message}`); }
  }
  const strict = cfg.pikichannelStrictAuth === true || process.env.PIKICHANNEL_STRICT === '1';
