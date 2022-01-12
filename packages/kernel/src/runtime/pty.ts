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
