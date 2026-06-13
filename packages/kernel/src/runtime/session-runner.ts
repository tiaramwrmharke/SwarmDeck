import type {
  UniversalSnapshot, UniversalInteraction, UniversalToolCall, UniversalUsage, UniversalSubAgent,
} from '../protocol/index.js';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverEvent, DriverResult, SteerFn } from '../contracts/driver.js';
import type { InteractionHandler } from '../contracts/ports.js';

// Drives ONE turn of ONE session: applies driver events into an accumulating
// UniversalSnapshot and owns the single-session control verbs (stop/steer/interact).
// Knows nothing about chat ids, queues, or transports.

export class SessionRunner {
  readonly snapshot: UniversalSnapshot;
  private seq = 0;
  private readonly abort = new AbortController();
  private steerFn: SteerFn | null = null;
  private pending: { promptId: string; resolve: (a: Record<string, string[]>) => void } | null = null;
  private finished = false;

  constructor(
    readonly sessionKey: string,
    readonly agent: string,
    readonly taskId: string,
    private readonly onUpdate: (snapshot: UniversalSnapshot, seq: number) => void,
    private readonly interactionHandler?: InteractionHandler,
  ) {
    this.snapshot = {
      phase: 'queued', taskId, agent, sessionId: null,
      text: '', reasoning: '', activity: '',
      toolCalls: [], interactions: [], artifacts: [],
      updatedAt: Date.now(),
    };
  }

  get currentSeq(): number { return this.seq; }

  private publish(): void {
    this.snapshot.updatedAt = Date.now();
    this.seq += 1;
    this.onUpdate(this.snapshot, this.seq);
  }

