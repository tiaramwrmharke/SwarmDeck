import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureGitignore } from '../src/core/utils.js';

describe('ensureGitignore', () => {
  let dir: string;
  let gi: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdeck-gi-'));
    gi = path.join(dir, '.gitignore');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when there is no .gitignore', () => {
