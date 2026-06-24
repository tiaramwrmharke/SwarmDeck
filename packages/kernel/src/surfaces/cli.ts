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
    let sessionKey: string | undefined;          // conversation continuity across lines
    let pendingPromptId: string | null = null;   // a HITL question awaiting an answer from this terminal
    let lastQueued = 0;

    this.unsub = io.subscribe((key, snap) => {
      if (sessionKey && key !== sessionKey) return;          // single-conversation terminal
      const interaction = (snap.interactions || [])[0];
      if (interaction && interaction.promptId !== pendingPromptId && snap.phase !== 'done') {
