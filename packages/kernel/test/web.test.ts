import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { WebSurface } from '../src/surfaces/web.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { Catalog } from '../src/contracts/ports.js';
import { applySnapshotPatch, type UniversalSnapshot } from '../src/protocol/index.js';

async function waitFrame(frames: any[], type: string, ms = 4000): Promise<any> {
  const t0 = Date.now();
  while (true) {
    const f = frames.find(x => x.type === type);
    if (f) return f;
    if (Date.now() - t0 > ms) throw new Error(`no ${type} frame`);
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('WebSurface (UniversalSnapshot wire protocol over ws)', () => {
  let tmp: string;
  let loom: Loom;
  let web: WebSurface;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-web-'));
    web = new WebSurface({ port: 0 });
    loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo', sessionStore: new FsSessionStore(tmp), surfaces: [web] });
