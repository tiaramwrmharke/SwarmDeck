import { createRequire } from 'node:module';
import type { TuiSpec } from '../contracts/driver.js';

const require = createRequire(import.meta.url);

let _pty: any | null | undefined;
function loadPty(): any | null {
  if (_pty === undefined) {
    try { _pty = require('node-pty'); } catch { _pty = null; }
  }
  return _pty;
}

export function ptyAvailable(): boolean { return !!loadPty(); }

export interface PtyOpenOpts { cols?: number; rows?: number }
export interface PtyExit { exitCode: number; signal?: number }

// A pseudo-terminal bridge around an agent's interactive process. Carries raw TUI bytes
// in both directions and fans `onData` out to many observers (full passthrough + tee/mirror).
// This is the capability the kernel previously lacked: transparently passing through
// Claude/Codex TUI traffic instead of only the structured -p stream.
export class PtyBridge {
  private readonly dataCbs = new Set<(d: string) => void>();
  private readonly exitCbs = new Set<(e: PtyExit) => void>();
