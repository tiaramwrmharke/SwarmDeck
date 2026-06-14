import readline from 'node:readline';
import type { LoomIO, Surface } from '../contracts/surface.js';

// Simplest possible terminal: stdin lines -> prompts, snapshot text -> stdout.
// Demonstrates that IM/Web/CLI are all just Terminals over the same LoomIO.
export class CliSurface implements Surface {
  readonly id = 'cli';
  readonly capabilities = { editMessages: false, images: false, buttons: false };

  private rl?: readline.Interface;
  private unsub?: () => void;

  constructor(private readonly opts: { agent?: string; input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {}) {}

  async start(io: LoomIO): Promise<void> {
    const out = this.opts.output || process.stdout;
