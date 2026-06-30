import { describe, it, expect } from 'vitest';
import { createLoom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import type { Catalog } from '../src/contracts/ports.js';

describe('catalog / discovery', () => {
  it('listAgentInfo derives capabilities from the driver registry (no app input)', () => {
    const loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo' });
    const info = loom.io.listAgentInfo();
    expect(info.map(a => a.id)).toEqual(['echo']);
    expect(info[0].capabilities).toEqual({ steer: true, interact: true, resume: true, tui: true });
  });

  it('default catalog is empty (kernel bakes in zero model/effort/tool/skill knowledge)', async () => {
    const loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo' });
    expect(await loom.io.listModels('echo')).toEqual([]);
    expect(await loom.io.listEffort('echo')).toEqual([]);
    expect(await loom.io.listTools('echo')).toEqual([]);
    expect(await loom.io.listSkills('echo')).toEqual([]);
  });

