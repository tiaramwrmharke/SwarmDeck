import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { UniversalSnapshot } from '../src/protocol/index.js';
import type { LoomIO } from '../src/contracts/surface.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult } from '../src/contracts/driver.js';

function watch(io: LoomIO) {
  const updates: UniversalSnapshot[] = [];
  let resolveDone: (s: UniversalSnapshot) => void;
  const done = new Promise<UniversalSnapshot>((r) => { resolveDone = r; });
  const unsub = io.subscribe((_k, s) => {
    updates.push(structuredClone(s));
    if (s.phase === 'done') resolveDone(structuredClone(s));
  });
  return { updates, done, unsub };
}
const waitFor = async (pred: () => boolean | Promise<boolean>, ms = 5000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 5));
  }
};

describe('kernel runtime (EchoDriver, hermetic)', () => {
  let tmp: string;
  let loom: Loom;

  beforeEach(async () => {
