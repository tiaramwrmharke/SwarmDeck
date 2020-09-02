import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { isFileLocator, segmentPaths } from '../dashboard/src/pages/sessions/markdown.tsx';
import { resolveOpenPathLocator } from '../src/dashboard/routes/config.ts';
import { makeTmpDir } from './support/env.ts';

describe('dashboard file link parsing', () => {
  it('treats real paths (rooted, relative, with directory segments) as locators', () => {
    expect(isFileLocator('dashboard/src/pages/sessions/markdown.tsx:42')).toBe(true);
    expect(isFileLocator('./src/dashboard/routes/config.ts:12:3')).toBe(true);
    expect(isFileLocator('/Users/me/app.ts')).toBe(true);
    expect(isFileLocator('~/notes/todo.md')).toBe(true);
    expect(isFileLocator('file:///Users/me/app.ts')).toBe(true);
  });

  it('does NOT linkify bare file names — they are ambiguous, not addresses', () => {
    expect(isFileLocator('package.json')).toBe(false);
    expect(isFileLocator('AGENTS.md')).toBe(false);
    expect(isFileLocator('SKILL.md')).toBe(false);
    expect(isFileLocator('Dockerfile')).toBe(false);
  });

  it('rejects web URLs, domains, and version-like tokens', () => {
    expect(isFileLocator('https://example.com/file.ts')).toBe(false);
    expect(isFileLocator('github.com/openai')).toBe(false);
