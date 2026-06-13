import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type EnvSnapshot = Record<string, string | undefined>;

export function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function captureEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]));
}
