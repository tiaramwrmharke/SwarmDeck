import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn(() => ({ pid: 4321, unref: vi.fn() }));
const execFileSyncMock = vi.fn(() => '');

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: spawnMock,
    execFileSync: execFileSyncMock,
  };
});

const ORIGINAL_ENV = { ...process.env };

async function loadModule() {
  return import('../src/core/process-control.ts');
}

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.PIKILOOM_DAEMON_CHILD;
  delete process.env.PIKILOOM_RESTART_STATE_FILE;
  delete process.env.PIKILOOM_RESTART_CMD;
  delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;
