import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigPath } from './config/user-config.js';

// Per-turn终态 audit trail. Prod runs with no disk logs at all, which turns every
// swallowed-reply report into jsonl archaeology (reconstructing process lifetimes from MCP log
// filenames). One JSON line per finished turn — how it ended, not what it said — is enough to
// answer "who ended this turn and why" after the fact. Appends must never break a turn.

const MAX_AUDIT_BYTES = 2 * 1024 * 1024;

export interface TurnAuditEntry {
  agent: string;
  sessionId: string | null;
