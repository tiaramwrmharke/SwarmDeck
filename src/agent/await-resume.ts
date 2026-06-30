import fs from 'node:fs';
import path from 'node:path';
import type { Agent, AwaitResumeState } from './types.js';

const AWAIT_FILE = 'awaiting.json';
const MAX_REASON_CHARS = 280;

