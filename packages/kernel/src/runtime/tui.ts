import type { TuiSpec } from '../contracts/driver.js';
import { PtyBridge, type PtyExit } from './pty.js';

export interface AttachTuiOptions {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  observers?: Array<(chunk: string) => void>; // tee the raw TUI stream (e.g. mirror to web/record)
}

