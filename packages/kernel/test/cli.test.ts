import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { CliSurface } from '../src/surfaces/cli.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { Catalog } from '../src/contracts/ports.js';

const catalog: Catalog = {
  async listModels({ agent }) { return [{ id: `${agent}-m1` }, { id: `${agent}-m2` }]; },
  async listEffort() { return []; },
  async listTools() { return []; },
  async listSkills() { return []; },
};
const waitFor = async (pred: () => boolean, ms = 6000) => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 10)); }
};

describe('CliSurface (terminal mode over LoomIO, hermetic)', () => {
  let tmp: string;
  let loom: Loom;
  let input: PassThrough;
  let outBuf = '';

  beforeEach(async () => {
