import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importFilesIntoWorkspace } from '../src/agent/session';

describe('importFilesIntoWorkspace', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup) fs.rmSync(dir, { recursive: true, force: true });
    cleanup.length = 0;
  });

