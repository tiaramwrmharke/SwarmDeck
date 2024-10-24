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

  it('an app-supplied Catalog drives discovery as opaque descriptors', async () => {
    const catalog: Catalog = {
      async listModels({ agent }) { return [{ id: `${agent}-m1`, label: 'M1', providerName: 'acme', contextWindow: 200000 }]; },
      async listEffort({ agent, model }) { return [{ id: 'low' }, { id: 'high', label: `${agent}/${model ?? 'default'}` }]; },
      async listTools() { return [{ id: 't', name: 'Tool', enabled: true }]; },
      async listSkills() { return [{ id: 's', name: 'Skill' }]; },
    };
    const loom = createLoom({ drivers: [new EchoDriver()], defaultAgent: 'echo', catalog });
