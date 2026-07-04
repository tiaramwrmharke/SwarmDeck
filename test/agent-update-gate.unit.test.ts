import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  withAgentUpdateGate,
  awaitAgentUpdateIdle,
  agentUpdateMarkerPath,
} from '../src/agent/auto-update.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const IDS = ['__vitest_a__', '__vitest_b__', '__vitest_c__'];

afterEach(() => {
  for (const id of IDS) {
    try { fs.rmSync(agentUpdateMarkerPath(id), { force: true }); } catch {}
  }
});

describe('agent update gate', () => {
  it('is a no-op when no reinstall is in flight', async () => {
    const start = Date.now();
    await awaitAgentUpdateIdle('__vitest_a__', 10_000);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('makes a spawn wait until the in-flight reinstall finishes', async () => {
    let finishInstall!: () => void;
    const install = new Promise<void>(resolve => { finishInstall = resolve; });

    const updatePromise = withAgentUpdateGate('__vitest_a__', () => install);
    expect(fs.existsSync(agentUpdateMarkerPath('__vitest_a__'))).toBe(true);

    let unblocked = false;
