import { getProvider } from './store.js';
import { validateProvider, type ProviderModelInfo } from './validation.js';
import type { ProviderConfig } from './types.js';

const TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  models: string[];
  modelInfos: ProviderModelInfo[];
  fetchedAt: number;
  providerUpdatedAt: string;
}

const GLOBAL_KEY = Symbol.for('swarmdeck.providerModelsCache');
const _existing = (globalThis as any)[GLOBAL_KEY] as Map<string, CacheEntry> | undefined;
const cache: Map<string, CacheEntry> = _existing || new Map<string, CacheEntry>();
if (!_existing) (globalThis as any)[GLOBAL_KEY] = cache;
