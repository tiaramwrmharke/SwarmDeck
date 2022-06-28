import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sessionAwaitPath, readAwaitResume, clearAwaitResume,
} from '../src/agent/await-resume.ts';
import { awaitResumeTools } from '../src/agent/mcp/tools/await-resume.ts';
import { makeTmpDir } from './support/env.ts';

const AGENT = 'claude' as const;
const sid = 'session_await_001';

let workdir: string;
