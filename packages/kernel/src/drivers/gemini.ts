import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult, DriverEvent, TuiInput, TuiSpec, NativeSessionInfo } from '../contracts/driver.js';
import type { UniversalUsage } from '../protocol/index.js';
import { discoverGeminiNativeSessions } from './native.js';
import { createLineBuffer, parseJsonLine, sigterm, wireAbort } from './shared.js';

// Native kernel Gemini driver: `gemini --output-format stream-json ... -p <prompt>` and
// parse its stream-json events into kernel DriverEvents. Faithful to swarmdeck's geminiParse.
export class GeminiDriver implements AgentDriver {
  readonly id = 'gemini';
  readonly capabilities = { steer: false, interact: false, resume: true, tui: true };

  constructor(private readonly bin: string = 'gemini') {}

  run(input: AgentTurnInput, ctx: DriverContext): Promise<DriverResult> {
    const args = ['--output-format', 'stream-json'];
    if (input.model) args.push('--model', input.model);
    if (input.sessionId) args.push('--resume', input.sessionId);
    const extra = input.extraArgs || [];
    if (!extra.some(a => a === '--approval-mode' || a === '--yolo' || a === '-y')) args.push('--approval-mode', 'yolo');
    if (extra.length) args.push(...extra);
    args.push('-p', input.prompt);

    const s = { text: '', sessionId: input.sessionId ?? null, input: null as number | null, output: null as number | null, cached: null as number | null, stopReason: null as string | null, error: null as string | null };
    const tools = new Map<string, { name: string; summary: string }>();

    return new Promise<DriverResult>((resolve) => {
      let child: ChildProcess;
