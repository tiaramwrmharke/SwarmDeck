import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CredentialRef } from './ref.js';
import { readKeychain } from './store.js';
import { unsealInline } from './inline-seal.js';

const execFileP = promisify(execFile);

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  commandTimeoutMs?: number;
}

export async function resolveCredential(ref: CredentialRef, opts: ResolveOptions = {}): Promise<string> {
  const env = opts.env ?? process.env;
  switch (ref.source) {
    case 'keychain': {
      const value = await readKeychain(ref.account);
      if (!value) throw new Error(`Keychain entry not found: ${ref.account}`);
      return value;
    }
    case 'env': {
      const value = env[ref.varName];
      if (!value) throw new Error(`Environment variable not set: ${ref.varName}`);
