import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoom, type Loom } from '../src/runtime/loom.js';
import { FsSessionStore } from '../src/ports/defaults.js';
import { claudeResumeArgs } from '../src/drivers/claude.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult } from '../src/contracts/driver.js';

const flushTurns = () => new Promise((r) => setTimeout(r, 50));

// A scripted driver that keeps a STABLE native id across turns (a rewind resumes the same
// session), records every AgentTurnInput, and stamps a per-turn anchor. `canRewind` toggles
// the capability so the rejection path is exercised too.
class RewindDriver implements AgentDriver {
  readonly runs: AgentTurnInput[] = [];
  nativeId = 'native-parent';
  turn = 0;
  /** null = the driver can't judge anchors; otherwise these no longer hydrate. */
  unresolvable: Set<string> | null = null;
  constructor(readonly id: string, private readonly canRewind: boolean) {}
  get capabilities() { return { steer: false, interact: false, resume: true, tui: false, fork: false, rewind: this.canRewind }; }
  anchorResolvable(opts: { sessionId: string; workdir: string; anchor: string }): boolean {
    return this.unresolvable ? !this.unresolvable.has(opts.anchor) : true;
