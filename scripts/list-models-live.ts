import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { listModels } from '../src/agent/stream.ts';
import { DEFAULT_AGENT_MODELS } from '../src/core/config/runtime-config.ts';

function hasCmd(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
