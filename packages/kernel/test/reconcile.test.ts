import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsSessionStore, isProcessAlive } from '../src/ports/defaults.js';
import { createLoom } from '../src/runtime/loom.js';

// Orphan reconciliation: a session stranded at runState:'running' by a process that died
// mid-turn must be repaired to 'incomplete' at startup — but ONLY when its owner pid is dead,
// so a store shared by several live processes (dev + prod on one home dir) never has a live
// turn clobbered by another instance's boot.
describe('FsSessionStore orphan reconciliation', () => {
  let tmp: string; let store: FsSessionStore;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-reconcile-'));
    store = new FsSessionStore(tmp);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  async function seed(agent: string, sessionId: string, patch: Record<string, unknown>): Promise<void> {
    await store.ensure(agent, { sessionId, workdir: tmp, title: sessionId });
    const rec = (await store.get(agent, sessionId))!;
    await store.save({ ...rec, ...patch });
  }
