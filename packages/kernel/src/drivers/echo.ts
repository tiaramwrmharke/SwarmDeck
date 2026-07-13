import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult } from '../contracts/driver.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Deterministic, dependency-free driver used for hermetic E2E. Its behavior is keyed
// off prompt prefixes so tests can exercise every event + control verb without timing
// races:
//   "ASK: <q>"  -> emits an interaction, awaits the answer, echoes it
//   "HOLD ..."  -> registers steer + blocks until steered OR stopped, then echoes
//   anything    -> reasoning + tool(running/done) + streamed text echo + usage
const ECHO_TUI = `process.stdout.write('ECHO-TUI-READY\\n');process.stdin.on('data',d=>{const s=d.toString();if(s.includes('Q')){process.stdout.write('BYE\\n');setTimeout(()=>process.exit(0),10);return;}process.stdout.write('GOT:'+s);});`;

export class EchoDriver implements AgentDriver {
  readonly id = 'echo';
  readonly capabilities = { steer: true, interact: true, resume: true, tui: true };

  // A hermetic raw-PTY "TUI": prints a banner, echoes input, exits on 'Q'. Lets the
  // Lane R passthrough path be exercised without a real agent.
  tui(input: { workdir: string; env?: Record<string, string> }): { command: string; args: string[]; cwd: string; env?: Record<string, string> } {
    return { command: process.execPath, args: ['-e', ECHO_TUI], cwd: input.workdir, env: input.env };
  }

  async run(input: AgentTurnInput, ctx: DriverContext): Promise<DriverResult> {
    const prompt = input.prompt;
    ctx.emit({ type: 'reasoning', delta: `Considering: ${prompt}` });

    if (prompt.startsWith('ASK:')) {
      const q = prompt.slice(4).trim() || 'Your input?';
