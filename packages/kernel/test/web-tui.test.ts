import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { WebSurface } from '../src/surfaces/web.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { ptyAvailable } from '../src/runtime/pty.js';

const waitFor = async (pred: () => boolean, ms = 6000) => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 10)); }
};

describe.skipIf(!ptyAvailable())('WebSurface Lane R — raw PTY / TUI over ws (hermetic)', () => {
  let tmp: string; let loom: Loom; let web: WebSurface;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-webtui-'));
    web = new WebSurface({ port: 0 });
    loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo', sessionStore: new FsSessionStore(tmp), surfaces: [web] });
    await loom.start();
  });
  afterEach(async () => { await loom.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('opens a TUI, streams raw bytes both ways, resizes, and reports exit', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${web.port}`);
    await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
    const frames: any[] = []; let tuiData = '';
    ws.on('message', d => { const m = JSON.parse(d.toString()); frames.push(m); if (m.type === 'tuiData') tuiData += m.data; });
    const send = (o: any) => ws.send(JSON.stringify(o));

    send({ type: 'hello', v: 1 });
