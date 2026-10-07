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

  it('recognizes an in-workspace file referenced via a symlinked path (no re-copy)', () => {
    const realRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'imp-real-'));
    cleanup.push(realRoot);
    const ws = path.join(realRoot, 'workspace');
    fs.mkdirSync(ws);
    fs.writeFileSync(path.join(ws, 'pic.png'), 'imgdata');

    const linkRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'imp-link-'));
    cleanup.push(linkRoot);
    const wsViaLink = path.join(linkRoot, 'ws-link');
    fs.symlinkSync(ws, wsViaLink);
