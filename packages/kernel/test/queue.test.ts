import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { applySnapshotPatch, type UniversalSnapshot } from '../src/protocol/index.js';
import type { LoomIO } from '../src/contracts/surface.js';

function watchAll(io: LoomIO) {
  const updates: UniversalSnapshot[] = [];
  const unsub = io.subscribe((_k, s) => updates.push(structuredClone(s)));
  return { updates, unsub };
}
const waitFor = async (pred: () => boolean | Promise<boolean>, ms = 6000) => {
  const t0 = Date.now();
  while (!(await pred())) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 5)); }
};

describe('per-session serial queue (hermetic)', () => {
  let tmp: string;
  let loom: Loom;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-q-'));
    loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo', sessionStore: new FsSessionStore(tmp) });
    await loom.start();
  });
  afterEach(async () => { await loom.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('a 2nd prompt to a busy session queues, then promotes in order on finish', async () => {
