import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createLoom } from '../src/runtime/loom.js';
import { ClaudeDriver } from '../src/drivers/claude.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import type { UniversalSnapshot } from '../src/protocol/index.js';

function claudePresent(): boolean {
