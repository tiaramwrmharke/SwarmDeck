import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getClaudeNativeGoal,
  buildClaudeSetGoalPrompt,
  buildClaudeClearGoalPrompt,
} from '../src/agent/drivers/claude.ts';
import { encodePathAsDirName } from '../src/core/platform.ts';
import { makeTmpDir, captureEnv, restoreEnv } from './support/env.ts';

const HOME_KEYS = ['HOME', 'USERPROFILE'] as const;

let tmpHome: string;
let tmpWorkdir: string;
let envSnap: ReturnType<typeof captureEnv>;

const SID = 'deadbeef-1111-2222-3333-444455556666';

function transcriptPath(): string {
  return path.join(tmpHome, '.claude', 'projects', encodePathAsDirName(tmpWorkdir), `${SID}.jsonl`);
}

function writeTranscript(lines: string[]): void {
  const file = transcriptPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
