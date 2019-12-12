import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigPath } from './config/user-config.js';

// Per-turn终态 audit trail. Prod runs with no disk logs at all, which turns every
// swallowed-reply report into jsonl archaeology (reconstructing process lifetimes from MCP log
// filenames). One JSON line per finished turn — how it ended, not what it said — is enough to
