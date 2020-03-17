import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigPath } from '../core/config/user-config.js';

// Durable per-turn snapshot of the content swarmdeck actually delivered.
//
// The agent CLIs are the source of truth for transcript history, but their session jsonl is
// lossy under two upstream conditions we cannot prevent: (1) a turn's closing reply dies before
// the CLI flushes it to disk (kill/flush race), and (2) the CLI's resume rewrites the jsonl in
// place and drops a turn that never got a synthetic-free conclusion. In both cases swarmdeck has
// already streamed the complete reply to the user (turn-audit confirms ok/end_turn), yet a later
// history render reads only a "No response requested." tombstone — the swallow.
//
// This sidecar is the missing durable copy: one JSON line per delivered turn, keyed by the user
// prompt, so the claude history renderer can restore the real reply at a tombstone instead of
// showing a bare "ended before a closing message" notice. It complements turn-audit.jsonl (which
// records how a turn ended, not what it said). See [[posttool-empty-result-no-response-requested]].

const MAX_SNAPSHOT_BYTES = 512 * 1024;   // per-session cap, single-slot rotation
const MAX_TEXT_CHARS = 40_000;           // don't archive megabyte replies verbatim
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

