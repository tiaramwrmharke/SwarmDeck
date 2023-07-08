import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { whichSync } from '../core/platform.js';
import { STATE_DIR_NAME } from '../core/constants.js';

const execFileAsync = promisify(execFile);

const PLIST_LABEL = 'ai.swarmdeck.gateway';
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(PLIST_DIR, `${PLIST_LABEL}.plist`);
const PIKILOOM_HOME = path.join(os.homedir(), STATE_DIR_NAME);
const LEGACY_PLIST_LABELS = ['ai.pikiclaw.gateway'];
const PROMPT_DELAY_MS = 3000;

export const FROM_LAUNCHD_ENV = 'PIKILOOM_FROM_LAUNCHD';

interface InvocationCommand {
  program: string;
  args: string[];
}

type DialogChoice = 'enable' | 'not_now' | 'closed';

type LogFn = (msg: string) => void;

function detectInvocation(): InvocationCommand | null {
  const entry = process.argv[1] || '';
  const userArgs = process.argv.slice(2);
  if (!userArgs.includes('--daemon')) userArgs.push('--daemon');

  if (entry.includes('/_npx/') || entry.includes('\\_npx\\')) {
    const npxBin = whichSync('npx');
    if (!npxBin) return null;
    return { program: npxBin, args: ['-y', 'swarmdeck@latest', ...userArgs] };
  }

  const swarmdeckBin = whichSync('swarmdeck');
  if (swarmdeckBin) return { program: swarmdeckBin, args: userArgs };
  return null;
}
