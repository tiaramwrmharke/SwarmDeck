import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { listModels } from '../src/agent/stream.ts';
import { DEFAULT_AGENT_MODELS } from '../src/core/config/runtime-config.ts';

function hasCmd(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd: string): string | null {
  try {
    return execSync(`${cmd} --version 2>/dev/null`, { encoding: 'utf-8' }).trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

const workdir = path.resolve(process.argv[2] || process.env.PIKILOOM_WORKDIR || process.cwd());
const claudeCurrentModel = (process.env.CLAUDE_MODEL || DEFAULT_AGENT_MODELS.claude).trim();
