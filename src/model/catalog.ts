import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request } from 'undici';
import { STATE_DIR_NAME } from '../core/constants.js';
import type { ModelsDevCatalog, ModelsDevProvider, ModelsDevModel } from './types.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const CACHE_PATH = path.join(os.homedir(), STATE_DIR_NAME, 'models-dev-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEnvelope {
  fetchedAt: number;
  data: ModelsDevCatalog;
}

let memCache: CacheEnvelope | null = null;
let inflight: Promise<ModelsDevCatalog> | null = null;

function readDiskCache(): CacheEnvelope | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.fetchedAt && parsed.data) {
      return parsed as CacheEnvelope;
    }
  } catch {}
