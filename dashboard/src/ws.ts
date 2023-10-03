import { useEffect, useRef } from 'react';
import { getEndpoint, isRemote } from './endpoint';

export type DashboardEventType = 'stream-update' | 'sessions-changed';

export interface DashboardEvent {
  type: DashboardEventType;
  key?: string;
  snapshot?: unknown;
}

type Listener = (event: DashboardEvent) => void;

const listeners = new Map<DashboardEventType, Set<Listener>>();
const reconnectListeners = new Set<() => void>();

interface Pipe { send(frame: string): void; close(): void; isOpen(): boolean; }
interface PipeCbs { onOpen(): void; onFrame(raw: string): void; onClose(): void; }
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let pipe: Pipe | null = null;
let connecting = false;
let authed = false;
let refCount = 0;
let keepAlive = false;
let wasConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 500;
const MAX_RECONNECT_DELAY = 8_000;

let token: string | null = null;
let tokenFetched = false;
async function ensureToken(): Promise<void> {
  if (tokenFetched) return;
  tokenFetched = true;
  const ep = getEndpoint();
  if (ep) { token = ep.token || null; return; }
  try {
    const r = await fetch('/pikichannel/pair');
    if (r.ok) { const j = await r.json(); if (j && typeof j.token === 'string') token = j.token; }
  } catch {  }
}

function dispatch(event: DashboardEvent) {
  const set = listeners.get(event.type);
  if (set) for (const fn of set) fn(event);
}

function wsUrl(path: string): string {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const ep = getEndpoint();
  if (!ep || !ep.host) return `${proto}//${loc.host}${path}`;
  const h = ep.host;
  let base: string;
  if (/^wss?:\/\//.test(h)) base = h.replace(/\/$/, '');
  else if (/^https:\/\//.test(h)) base = 'wss://' + h.slice(8).replace(/\/$/, '');
  else if (/^http:\/\//.test(h)) base = 'ws://' + h.slice(7).replace(/\/$/, '');
  else base = `${proto}//${h.replace(/\/$/, '')}`;
  return base + path;
}

function fireReconnect() {
  const isReconnect = wasConnected;
  wasConnected = true;
  reconnectDelay = 500;
  if (isReconnect) for (const fn of reconnectListeners) fn();
}

const channelSnaps = new Map<string, any>();
const channelSeqs = new Map<string, number>();
function applyChannelPatch(prev: any, patch: any): any {
  if (patch.full) return patch.full;
  const next = prev ? { ...prev } : { phase: 'idle', updatedAt: 0 };
  if (patch.appendText) next.text = (next.text || '') + patch.appendText;
  if (patch.appendReasoning) next.reasoning = (next.reasoning || '') + patch.appendReasoning;
  if (patch.set) Object.assign(next, patch.set);
  return next;
}

function channelToSnapshot(key: string, u: any): any {
  if (!u) return null;
  const sessionId = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
  const usage = u.usage || null;
  return {
    sessionId: u.sessionId ?? sessionId,
    phase: u.phase,
    taskId: u.taskId ?? null,
    queuedTaskIds: Array.isArray(u.queued) ? u.queued.map((q: any) => q.taskId) : [],
    queuedTasks: Array.isArray(u.queued) ? u.queued : [],
    interactions: Array.isArray(u.interactions) ? u.interactions.map((it: any) => ({
      promptId: it.promptId,
      kind: it.kind,
      title: it.title,
