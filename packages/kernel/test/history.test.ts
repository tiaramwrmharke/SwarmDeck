import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { UniversalSnapshot } from '../src/protocol/index.js';
import type { LoomIO } from '../src/contracts/surface.js';

function watchDone(io: LoomIO) {
  let resolveDone: (s: UniversalSnapshot) => void;
  const done = new Promise<UniversalSnapshot>((r) => { resolveDone = r; });
  const unsub = io.subscribe((_k, s) => { if (s.phase === 'done') resolveDone(structuredClone(s)); });
  return { done, unsub };
}
const waitFor = async (pred: () => boolean | Promise<boolean>, ms = 5000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 5));
  }
};

describe('session history / transcript (hermetic)', () => {
  let tmp: string;
  let loom: Loom;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-hist-'));
    loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo', sessionStore: new FsSessionStore(tmp) });
    await loom.start();
