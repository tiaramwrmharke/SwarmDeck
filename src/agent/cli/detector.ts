import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { RecommendedCli } from './registry.js';

export type CliState = 'not_installed' | 'installed_not_auth' | 'ready' | 'unknown';

export interface CliStatus {
  id: string;
  binary: string;
  state: CliState;
  version?: string;
  authDetail?: string;
  error?: string;
  checkedAt: number;
}

const DETECT_TTL_MS = 30_000;
const cache = new Map<string, CliStatus>();

function runArgv(argv: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = argv;
    execFile(cmd, rest, {
      timeout: timeoutMs,
      env: { ...process.env, NO_COLOR: '1', CLICOLOR: '0', TERM: 'dumb' },
      shell: false,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const code = (err as NodeJS.ErrnoException)?.code;
      const exitCode = typeof code === 'number' ? code : (err ? 1 : 0);
      resolve({
        ok: !err,
        stdout: stdout?.toString() || '',
        stderr: stderr?.toString() || '',
        code: typeof exitCode === 'number' ? exitCode : null,
      });
