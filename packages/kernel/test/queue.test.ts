import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { EchoDriver } from '../src/drivers/echo.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { applySnapshotPatch, type UniversalSnapshot } from '../src/protocol/index.js';
import type { LoomIO } from '../src/contracts/surface.js';

function watchAll(io: LoomIO) {
  const updates: UniversalSnapshot[] = [];
  const unsub = io.subscribe((_k, s) => updates.push(structuredClone(s)));
  return { updates, unsub };
}
