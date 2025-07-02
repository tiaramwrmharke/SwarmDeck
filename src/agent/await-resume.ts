import fs from 'node:fs';
import path from 'node:path';
import type { Agent, AwaitResumeState } from './types.js';

const AWAIT_FILE = 'awaiting.json';
const MAX_REASON_CHARS = 280;

export function sessionAwaitPath(workdir: string, agent: Agent, sessionId: string): string {
  return path.join(workdir, '.swarmdeck', 'sessions', agent, sessionId, AWAIT_FILE);
}

export function readAwaitResume(workdir: string, agent: Agent, sessionId: string): AwaitResumeState | null {
