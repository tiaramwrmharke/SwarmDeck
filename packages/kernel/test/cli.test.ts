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
