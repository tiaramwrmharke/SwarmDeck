import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult, TuiInput, TuiSpec } from '../src/contracts/driver.js';
import type { UniversalSnapshot } from '../src/protocol/index.js';
import type { Plugin } from '../src/contracts/surface.js';

// A driver that records the input the Hub assembled for it, so we can assert what the
// plugin/port merge produced (env, systemPrompt, extraArgs, configOverrides, MCP servers).
class CapturingDriver implements AgentDriver {
  readonly id = 'cap';
  readonly capabilities = { steer: false, interact: false, resume: false, tui: true };
  lastRun?: AgentTurnInput;
  lastTui?: TuiInput;
