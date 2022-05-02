import type { ApiRequestOptions } from './api';
import { api } from './api';
import type { SessionHubResult, SessionMessagesResult } from './types';

const WORKSPACE_CACHE_TTL_MS = 5_000;
const MESSAGE_CACHE_TTL_MS = 15_000;
const MAX_WORKSPACE_CACHE_ENTRIES = 8;
const MAX_MESSAGE_CACHE_ENTRIES = 30;
const MESSAGE_PREFETCH_CONCURRENCY = 1;

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
}

export interface SessionMessagesQuery {
  workdir: string;
  agent: string;
  sessionId: string;
  rich?: boolean;
  lastNTurns?: number;
  turnOffset?: number;
  turnLimit?: number;
}

const workspaceCache = new Map<string, CacheEntry<SessionHubResult>>();
const messageCache = new Map<string, CacheEntry<SessionMessagesResult>>();
const queuedMessagePrefetches = new Set<string>();
const messagePrefetchQueue: Array<() => Promise<void>> = [];
let activeMessagePrefetches = 0;

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

