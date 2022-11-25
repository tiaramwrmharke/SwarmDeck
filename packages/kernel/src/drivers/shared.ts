import type { ChildProcess } from 'node:child_process';

// Driver-internal helpers shared by the concrete drivers (claude/codex/gemini/acp).
// NOT part of the public API — nothing here is re-exported by any barrel. Each helper
// exists because the same code appeared verbatim in 3+ drivers.

/** Stateful newline splitter for a child process' stdout: feed chunks, get complete lines. */
export function createLineBuffer(): (chunk: Buffer | string) => string[] {
  let buf = '';
  return (chunk) => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    return lines;
  };
}

/** Parse one ndjson line; undefined for blank lines / non-JSON noise. */
export function parseJsonLine(line: string): any | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

/**
 * Run `fn` when the signal aborts (immediately if it already has). Returns an
 * unsubscribe for drivers that must detach the handler when the turn settles.
 */
export function wireAbort(signal: AbortSignal, fn: () => void): () => void {
  if (signal.aborted) { fn(); return () => {}; }
  signal.addEventListener('abort', fn, { once: true });
  return () => signal.removeEventListener('abort', fn);
}

/** SIGTERM a child, swallowing the already-dead race. */
export function sigterm(proc: ChildProcess | null | undefined): void {
  try { proc?.kill('SIGTERM'); } catch { /* ignore */ }
}

/** How long a reaped child may take to honour stdin EOF before it earns a SIGTERM.
 *  Override with PIKILOOM_REAP_GRACE_MS. */
const REAP_GRACE_DEFAULT_MS = 15_000;
export function reapGraceMs(): number {
  const raw = Number(process.env.PIKILOOM_REAP_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : REAP_GRACE_DEFAULT_MS;
}
/** How long it may then take to honour SIGTERM before it earns a SIGKILL.
 *  Override with PIKILOOM_REAP_FORCE_MS (tests need a sub-second escalation). */
const REAP_FORCE_DEFAULT_MS = 10_000;
