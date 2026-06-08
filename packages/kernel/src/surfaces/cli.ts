import readline from 'node:readline';
import type { LoomIO, Surface } from '../contracts/surface.js';

// Simplest possible terminal: stdin lines -> prompts, snapshot text -> stdout.
// Demonstrates that IM/Web/CLI are all just Terminals over the same LoomIO.
export class CliSurface implements Surface {
  readonly id = 'cli';
  readonly capabilities = { editMessages: false, images: false, buttons: false };

  private rl?: readline.Interface;
  private unsub?: () => void;

