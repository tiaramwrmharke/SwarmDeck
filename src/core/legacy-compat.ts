import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  STATE_DIR_NAME,
  LEGACY_STATE_DIR_NAMES,
  ENV_PREFIX,
  LEGACY_ENV_PREFIXES,
} from './constants.js';

export function hydrateLegacyEnv(): void {
  for (const legacy of LEGACY_ENV_PREFIXES) {
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      if (!key.startsWith(legacy)) continue;
      const mapped = ENV_PREFIX + key.slice(legacy.length);
      if (process.env[mapped] === undefined) process.env[mapped] = value;
    }
  }
}
