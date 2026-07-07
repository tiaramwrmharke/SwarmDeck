import { spawnSync } from 'node:child_process';

import { GIT_STATUS_TIMEOUT_MS } from './constants.js';

export interface GitStatus {
  branch: string | null;
  detached: boolean;
  shortSha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  changed: number;
}

export function readGitStatus(dir: string): GitStatus | null {
  if (!dir) return null;
  try {
    const result = spawnSync('git', ['status', '--porcelain=v2', '--branch', '--untracked-files=normal'], {
      cwd: dir,
      timeout: GIT_STATUS_TIMEOUT_MS,
      encoding: 'utf-8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return null;
    return parseGitStatusV2(result.stdout);
  } catch {
    return null;
  }
}
