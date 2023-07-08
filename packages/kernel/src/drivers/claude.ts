import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentDriver, AgentTurnInput, DriverContext, DriverResult, DriverEvent, TuiInput, TuiSpec, NativeSessionInfo } from '../contracts/driver.js';
import type { UniversalUsage, UniversalPlan, UniversalSubAgent } from '../protocol/index.js';
import { ClaudeWarmPool } from './claude-pool.js';
import { claudeAnchorResolvable, claudeTranscriptTailAnchor, discoverClaudeNativeSessions, encodeClaudeProjectDir } from './native.js';
import { attachedFileNote, canLeadProcessGroup, contextPercent, createLineBuffer, imageMimeForFile, parseJsonLine, reapChild, wireAbort } from './shared.js';

// Real driver: shells the local `claude` CLI in stream-json mode and normalizes its
// events into kernel DriverEvents. Faithful to swarmdeck's claude.ts event shapes
// (system / stream_event{message_start,content_block_delta,message_delta} / assistant / result),
// but fully self-contained. Proves "下层 Claude 不变".
export interface ClaudeDriverOptions {
  /** Keep the CLI process alive after a clean turn and reuse it for the session's next
   *  continuation turn (skips the ~4s spawn+init). Off by default: a parked process holds
   *  real memory and keeps the event loop alive, which a one-shot embedder must not inherit
   *  silently. Long-lived hosts opt in and call dispose() on shutdown. */
  warmPool?: boolean;
}

export class ClaudeDriver implements AgentDriver {
  readonly id = 'claude';
  readonly capabilities = { steer: true, interact: false, resume: true, tui: true, fork: true, rewind: true };
  private readonly pool: ClaudeWarmPool | null;
  /**
   * Every `-p` child this driver has spawned that has not exited yet — parked, mid-turn, or
   * released-but-still-shutting-down. The pool only ever knows about PARKED processes, so a
   * `dispose()` that walked the pool alone left the other two states running: on shutdown an
   * in-flight turn's CLI got no signal at all, and one released by a background-work settle was
   * already unreferenced. Entries remove themselves on `exit`, so this never grows unbounded.
   */
  private readonly spawned = new Set<ChildProcess>();

  constructor(private readonly bin: string = 'claude', opts: ClaudeDriverOptions = {}) {
    this.pool = opts.warmPool ? new ClaudeWarmPool() : null;
  }

  /** Reap every process this driver still owns — parked, running, or draining.
   *  Long-lived hosts call this on shutdown. */
  dispose(): void {
    this.pool?.dispose();
    for (const child of [...this.spawned]) reapChild(child, { graceMs: 0, group: true });
  }

  /** Track a child until it exits, so {@link dispose} can always find it. */
  private track(child: ChildProcess): void {
    this.spawned.add(child);
    child.once('exit', () => this.spawned.delete(child));
  }

  /** Live `-p` processes this driver still owns (tests + telemetry). */
  liveProcessCount(): number {
    return this.spawned.size;
  }

  /** Parked warm processes right now (tests + telemetry). */
  warmPoolSize(): number {
    return this.pool?.size() ?? 0;
  }

  // Interactive Claude Code TUI (no -p): the kernel spawns this in a PTY and passes
  // the terminal through. Model/resume/BYOK-env come from the kernel's resolution.
  tui(input: TuiInput): TuiSpec {
    const args: string[] = [];
    if (input.model) args.push('--model', input.model);
    // Fresh-pin wins over resume: `--session-id <uuid>` makes Claude start a NEW session and
    // write its transcript under the given id, so the host already knows the resumable key
    // before spawn (terminal-first new session). Falls back to `--resume` for an existing one.
    if (input.newSessionId) args.push('--session-id', input.newSessionId);
    else if (input.sessionId) args.push('--resume', input.sessionId);
    if (input.extraArgs?.length) args.push(...input.extraArgs);
    return { command: this.bin, args, cwd: input.workdir, env: input.env };
  }

  listNativeSessions(opts: { workdir: string; limit?: number }): NativeSessionInfo[] {
    return discoverClaudeNativeSessions(opts.workdir, { limit: opts.limit });
  }

  run(input: AgentTurnInput, ctx: DriverContext): Promise<DriverResult> {
    const steerable = !!input.steerable;
    // Always drive Claude over a stream-json stdin and keep that stdin OPEN for the whole turn.
    // That open stdin is what lets Claude's native "launch detached background work → end the
    // turn → wake itself up and report when the work finishes" flow play out: it only happens
    // while stdin stays open (with it closed, Claude exits at the first `result` and the wake-up
    // — and any in-process background agent/workflow — is lost). Image attachments also need the
    // stream-json user message (a plain text stdin can't carry images). `--replay-user-messages`
    // + registerSteer remain the only mid-turn-steer-specific bits.
    const args = ['-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages', '--input-format', 'stream-json'];
    if (input.model) args.push('--model', input.model);
    if (input.effort) args.push('--effort', input.effort === 'ultra' ? 'max' : input.effort); // request extended thinking (ultra is a display-only alias for max)
    if (input.sessionId) args.push(...claudeResumeArgs(input.sessionId, input.fork, input.rewind));
    if (input.systemPrompt) args.push('--append-system-prompt', input.systemPrompt);
    if (input.mcpConfigPath) args.push('--mcp-config', input.mcpConfigPath);
    if (input.permissionMode) args.push('--permission-mode', input.permissionMode); // parity: keep bypass/accept-edits on the kernel path
    if (steerable) args.push('--replay-user-messages'); // parity: mid-turn steer
    if (input.extraArgs?.length) args.push(...input.extraArgs);

    // Warm reuse: a rewind rebranches the session's transcript, so a parked process's
    // in-memory conversation is stale — destroy it. A fork never touches the parent's
    // transcript (the parked parent stays valid); the fork turn itself must cold-spawn
    // for its --fork-session flags. Only a plain continuation may reclaim a process, and
    // only when the spawn fingerprint still matches what a cold spawn would use now.
    const fingerprint = claudeProcessFingerprint(this.bin, input);
    if (input.rewind && input.sessionId) this.pool?.evictSession(input.sessionId);
    const pooled = (!input.fork && !input.rewind && input.sessionId && this.pool)
      ? this.pool.take(input.sessionId, fingerprint)
      : null;

    const state = {
      text: '', reasoning: '', streamedText: false, streamedReasoning: false,
      // Dangling-tool-loop tracking: sawToolResult flips on the first tool_result; textSinceToolResult
      // goes false at every tool_result and true again once the model streams visible text.
      sawToolResult: false, textSinceToolResult: false,
      // Wall-clock of the last parsed stream event — the hold cap defers while this is fresh.
      lastEventAt: Date.now(),
      sessionId: null as string | null, model: null as string | null,
      // Fork anchor: uuid of the latest REAL assistant transcript record seen this turn —
      // the inclusive keep-boundary a later fork of this session passes to --resume-session-at.
      anchor: null as string | null,
      stopReason: null as string | null, error: null as string | null,
      input: null as number | null, output: null as number | null, cached: null as number | null,
      cacheCreation: null as number | null,
      contextWindow: null as number | null, turnOutputTokensBase: 0, thinkingEstTokens: 0,
      subAgents: new Map<string, any>(),
      tools: new Map<string, { name: string; summary: string }>(),
      taskList: new Map<string, { subject: string; status: string }>(),
      taskOrder: [] as string[],
      pendingTaskCreates: new Map<string, { subject: string }>(),
      todoPlan: null as UniversalPlan | null,
      seenImages: new Set<string>(),
      // run_in_background lifecycle: task ids seen as started vs. reached a terminal status;
      // bgAgentTasks marks the sub-agent-backed ones (they earn the longer hold cap).
      bgStarted: new Set<string>(), bgTerminal: new Set<string>(), bgAgentTasks: new Set<string>(),
      // Background sub-agents: task/agent id → the launching tool_use id (the s.subAgents key),
      // and per-sub tail state for live-reading the sub's own transcript (see the tail poller —
      // a background sub's activity NEVER reaches the parent stream, tailing is the only source).
      bgTaskSub: new Map<string, string>(),
      subTails: new Map<string, ClaudeSubTail>(),
    };

    return new Promise<DriverResult>((resolve) => {
      let child: ChildProcess;
      let transport: 'cold' | 'warm' = 'cold';
      let promptDelivered = false;
      let settled = false;
      // One-shot guard for the truncated-turn recovery injection (see the result handler).
      let truncatedRecoveryAttempted = false;
      // Bounded counter for the no-op-resume recovery re-injection (see the result handler): a
      // resume of a session left incomplete by a prior turn can no-op several times before the
      // CLI's repair clears and it runs our prompt for real.
      let noopResumeRetries = 0;
      // holdCap: hard backstop while a background task is still running (never-completing daemon).
      // quiet: fires once all known background tasks finished AND Claude has gone quiet, so trailing
      // wake-up turns can still land before we close (see claudeBgSettleQuietMs).
      let holdCapTimer: ReturnType<typeof setTimeout> | null = null;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      // subTail: live tail of background sub-agents' own transcripts — the ONLY place their
      // activity is observable (see pollClaudeSubAgentTails). Armed once the first async sub
      // registers; cleared (after a final sweep) at settle.
      let subTailTimer: ReturnType<typeof setInterval> | null = null;
      // modelStall: watchdog that fires only while the turn is waiting on the MODEL with nothing
      // streaming — the initial wait after the prompt, or after a tool_result handed control back —
      // never while a tool or background task is still running (see armModelStall / armModelStallIfIdle).
      let modelStallTimer: ReturnType<typeof setTimeout> | null = null;
      const usageOf = () => this.usage(state);
      const unref = (tm: any) => { if (tm && typeof tm.unref === 'function') tm.unref(); };
      let disposeAbort: (() => void) | null = null;
      let detachTurnListeners: () => void = () => { /* set once listeners exist */ };
      const clearHoldCap = () => { if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; } };
      const clearQuiet = () => { if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; } };
      const clearModelStall = () => { if (modelStallTimer) { clearTimeout(modelStallTimer); modelStallTimer = null; } };
      const clearSubTail = () => { if (subTailTimer) { clearInterval(subTailTimer); subTailTimer = null; } };
      // A launch notice normally names the sub's transcript (output_file); when that line is
      // absent, derive the canonical side-transcript path once agentId + sessionId are known.
      const fillSubTailFiles = () => {
        for (const tail of state.subTails.values()) {
          if (!tail.file && tail.agentId && state.sessionId) {
            tail.file = join(homedir(), '.claude', 'projects', encodeClaudeProjectDir(input.workdir), state.sessionId, 'subagents', `agent-${tail.agentId}.jsonl`);
          }
        }
      };
      const pollSubTails = () => {
        try { fillSubTailFiles(); pollClaudeSubAgentTails(state, ctx.emit); } catch { /* observe-only — never break the turn */ }
      };
      const armSubTail = () => {
        if (subTailTimer || !state.subTails.size) return;
        subTailTimer = setInterval(() => { if (settled) { clearSubTail(); return; } pollSubTails(); }, claudeSubTailPollMs());
        unref(subTailTimer);
      };
      // kill=true SIGTERMs immediately — fast exit, used once nothing is left running in the
      // background (a normal turn, or a wake-up turn after every background task finished).
      // kill=false only ends stdin and lets Claude shut down on its own, so any still-running
      // detached background work survives a clean exit (a hard kill mid-flight is exactly what
      // tore the background — and the wake-up — down before). A leak-guard SIGTERM is the backstop.
      const finish = (r: DriverResult, kill = true, park = false) => {
        if (settled) return; settled = true;
        clearHoldCap(); clearQuiet(); clearModelStall();
        // Final tail sweep BEFORE resolving: tools the subs wrote since the last tick still make
        // it into the turn's live trail (the runtime folds emitted events until run() resolves).
        if (state.subTails.size) { pollSubTails(); }
        clearSubTail();
        disposeAbort?.();
        // Park instead of kill: only a CLEAN settle qualifies (ok, no error, no abort, the
        // process still healthy, session known) — every other exit keeps today's semantics,
        // so pooling can never leak a wedged or errored process.
        if (park && this.pool && state.sessionId && r.ok && !r.error && !ctx.signal.aborted
            && child && !child.killed && child.exitCode == null) {
          detachTurnListeners();
          this.pool.put(state.sessionId, fingerprint, child);
          resolve({ ...r, transport });
          return;
        }
        try { child?.stdin?.end(); } catch { /* ignore */ }
        if (child && !child.killed && child.exitCode == null) {
          // Reap rather than fire-and-forget: one SIGTERM with nothing watching is how a
          // wedged CLI became an unowned resident process (see reapChild). kill=true wants
          // the SIGTERM now; kill=false grants the transcript-flush grace first.
          reapChild(child, { graceMs: kill ? 0 : CLAUDE_EXIT_LEAK_GUARD_MS, group: true });
        }
        resolve({ ...r, transport });
      };
      const settleResult = (opts: { stopReason?: string | null; kill?: boolean; ok?: boolean; park?: boolean } = {}) => finish({
        ok: opts.ok ?? !state.error, text: state.text, reasoning: state.reasoning || undefined,
        error: state.error, stopReason: opts.stopReason ?? state.stopReason, sessionId: state.sessionId, anchor: state.anchor, usage: usageOf(),
      }, opts.kill ?? true, opts.park ?? false);
      // Cap while holding for a still-running background task (stopReason marks it as
      // "still running in the background" so the terminal presentation reads right). Idempotent —
      // the countdown is absolute from the first arm. Sub-agent-backed holds use the longer
      // agent cap, and a cap that fires while events are still flowing defers instead of
      // cutting an actively-working turn mid-generation (the 2026-07-06 "停止不再继续生成":
      // the 10-min cap yanked a live research turn 22s after its last tool_result and the
      // graceful-close leak guard then killed the 4 still-running Explore agents).
      const armHoldCap = () => {
        if (holdCapTimer) return;
        const capMs = claudeTurnHasAgentBackground(state) ? claudeBgAgentHoldCapMs() : claudeBgHoldCapMs();
        const fire = () => {
          holdCapTimer = null;
          if (settled) return;
          if (Date.now() - (state.lastEventAt ?? 0) < claudeBgSettleQuietMs()) {
            holdCapTimer = setTimeout(fire, claudeBgHoldRecheckMs());
            unref(holdCapTimer);
            return;
          }
          settleResult({ stopReason: 'background', kill: false });
        };
        holdCapTimer = setTimeout(fire, capMs);
        unref(holdCapTimer);
      };
      // Grace close once all background work is done: settle gracefully (no kill) if Claude stays
      // quiet for the window. Re-armed on every event, so a still-streaming wake-up keeps it open.
      // park: by the time this fires every background task has reported terminal AND Claude has
      // been silent for the whole quiet window, so the process is idle-and-healthy — exactly the
      // state the pool wants. Withholding it here was the process leak's other half: a turn that
      // used run_in_background TOOK the parked process out of the pool and never put it back, so
      // the session's next turn always cold-spawned (measured 78% of continuations) while the
      // taken process was released unowned. finish() still re-checks health before parking.
      const armQuiet = () => {
        clearQuiet();
        quietTimer = setTimeout(() => { if (!settled) settleResult({ kill: false, park: true }); }, claudeBgSettleQuietMs());
        unref(quietTimer);
      };
      // Model-stall watchdog: while the turn waits on the model with nothing streaming, the model
      // normally emits its next message within a couple of seconds. If instead it goes fully silent —
      // no stream/assistant events — the turn is stuck waiting on the MODEL (a provider stall,
      // rate-limit backoff, or an unreachable model that the CLI is silently retrying), NOT on a tool
      // (a running tool has no tool_result yet, so this is never armed then) and NOT on background work
      // (its own hold, re-checked below). Left alone the kernel turn hangs forever with the answer never
      // delivered. Bound it: settle gracefully (no kill) as incomplete with stopReason 'stalled' so the
      // terminal shows a clear "resend to continue" note instead of a dead spinner. Armed for the initial
      // wait (after prompt delivery) and after a tool_result, and re-armed (if idle) on an API-error
      // event; cleared the moment the model emits REAL output.
      const armModelStall = () => {
        clearModelStall();
        modelStallTimer = setTimeout(() => {
