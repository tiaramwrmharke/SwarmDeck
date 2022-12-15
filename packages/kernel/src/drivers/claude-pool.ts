import type { ChildProcess } from 'node:child_process';
import { reapChild } from './shared.js';

// ── Warm Claude process pool ─────────────────────────────────────────────────────────
// A `claude -p --input-format stream-json` process stays alive after `result` for as long
// as its stdin is open, and a user message written to that stdin runs a NEW turn in the
// same conversation (the steer path has always relied on this). Every cold spawn costs
// ~4s of CLI init before the first model request — the single largest local overhead of a
// Claude turn — so after a clean settle the driver parks the process here instead of
// killing it, and the session's next continuation turn skips the spawn entirely.
//
// Discipline (mirrors mirasim's Codex warm pool):
//  - keyed by native session id; one process per session, serial turns only.
//  - a process is reused only when its spawn-time fingerprint (model/effort/workdir/…)
//    still matches what a cold spawn would use; any drift destroys it and goes cold.
//  - idle processes are destroyed after a TTL; the pool is size-capped (oldest-idle out).
//  - only CLEAN settles pool (no error / abort / timeout / background hold); everything
//    else keeps today's kill semantics, so pooling can never leak a wedged process.

// Idle TTL before a parked process is destroyed. Override with PIKILOOM_CLAUDE_WARM_IDLE_MS.
const CLAUDE_WARM_IDLE_TTL_DEFAULT_MS = 10 * 60_000;
export function claudeWarmIdleTtlMs(): number {
  const raw = Number(process.env.PIKILOOM_CLAUDE_WARM_IDLE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : CLAUDE_WARM_IDLE_TTL_DEFAULT_MS;
}
// Max parked processes (each holds a full CLI + its MCP servers — roughly 0.5–1 GB).
// Override with PIKILOOM_CLAUDE_WARM_MAX.
const CLAUDE_WARM_MAX_DEFAULT = 4;
export function claudeWarmMaxProcesses(): number {
  const raw = Number(process.env.PIKILOOM_CLAUDE_WARM_MAX);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : CLAUDE_WARM_MAX_DEFAULT;
}
// After ending a parked process's stdin, escalate to SIGTERM only if it hasn't exited on its
// own within this window — same leak-guard shape as a graceful turn settle.
const CLAUDE_WARM_DESTROY_GUARD_MS = 15_000;

interface ParkedClaude {
  child: ChildProcess;
  fingerprint: string;
  parkedAt: number;
  idleTimer: ReturnType<typeof setTimeout>;
  onClose: () => void;
  drain: () => void;
}

/** End a no-longer-poolable process the same way a graceful settle does. */
function destroyClaudeChild(child: ChildProcess): void {
  // group: the parked process came from the driver's detached spawn, so a wedged one
