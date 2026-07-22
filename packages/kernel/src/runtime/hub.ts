import { randomUUID } from 'node:crypto';
import {
  type UniversalSnapshot, type SnapshotPatch, type SessionMeta, type UniversalQueuedTask,
  type AgentInfo, type ModelDescriptor, type EffortOption, type ToolDescriptor, type SkillDescriptor,
  diffSnapshot, emptySnapshot, makeSessionKey, splitSessionKey, turnLanded,
} from '../protocol/index.js';
import type { AgentDriver, AgentTurnInput, McpServerSpec, TuiSpec } from '../contracts/driver.js';
import type {
  SessionStore, ModelResolver, ToolProvider, SystemPromptBuilder, InteractionHandler, Catalog,
} from '../contracts/ports.js';
import type { LoomIO, PromptInput, ForkSessionInput, ForkSessionResult, Plugin, SpawnContribution } from '../contracts/surface.js';
import { SessionRunner } from './session-runner.js';
import { buildForkSeed } from './fork.js';
import { normalizeImageAttachments } from '../attachments.js';

export interface HubDeps {
  drivers: Map<string, AgentDriver>;
  defaultAgent: string;
  workdir: string;
  sessionStore: SessionStore;
  modelResolver: ModelResolver;
  toolProvider: ToolProvider;
  systemPromptBuilder: SystemPromptBuilder;
  catalog: Catalog;
  interactionHandler: InteractionHandler;
  plugins: Plugin[];
  serialPerSession?: boolean;   // default true: one turn per session at a time, queue the rest
  systemPromptBase?: string;
  log?: (msg: string) => void;
}

interface SessionEntry {
  meta: SessionMeta;
  snapshot: UniversalSnapshot;
  lastPublished: UniversalSnapshot;
  seq: number;
  runner?: SessionRunner;
}

// A turn accepted but not yet started (the session is busy). The turn is built lazily at
// promotion time so injection / tools / resume-target reflect the latest session state.
interface QueuedItem {
  runner: SessionRunner;
  taskId: string;
  input: PromptInput;
  driver: AgentDriver;
  agent: string;
  sessionId: string;
  sessionKey: string;
  workdir: string;
  workspacePath: string;
  preExisted: boolean;
}

export class Hub implements LoomIO {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly runnersByTask = new Map<string, SessionRunner>();
  private readonly active = new Map<string, SessionRunner>();        // sessionKey -> currently running turn
  private readonly waiting = new Map<string, QueuedItem[]>();        // sessionKey -> FIFO of queued turns
  private readonly seqByKey = new Map<string, number>();             // monotonic publish seq per session (survives turn changes)
  private readonly updateSubs = new Set<(k: string, s: UniversalSnapshot, p: SnapshotPatch, seq: number) => void>();
  private readonly sessionsSubs = new Set<(s: SessionMeta[]) => void>();

  constructor(private readonly deps: HubDeps) {}

  listAgents(): string[] { return [...this.deps.drivers.keys()]; }

  // ---- discovery (capabilities from drivers; models/effort/tools/skills from Catalog) ----
  listAgentInfo(): AgentInfo[] {
    return [...this.deps.drivers.values()].map(d => ({ id: d.id, capabilities: d.capabilities }));
  }
  listModels(agent: string): Promise<ModelDescriptor[]> {
    return this.deps.catalog.listModels({ agent }).catch((e: any) => { this.deps.log?.(`[hub] listModels failed: ${e?.message || e}`); return []; });
  }
  listEffort(agent: string, model?: string | null): Promise<EffortOption[]> {
    return this.deps.catalog.listEffort({ agent, model: model ?? null }).catch((e: any) => { this.deps.log?.(`[hub] listEffort failed: ${e?.message || e}`); return []; });
  }
  listTools(agent: string, workdir?: string): Promise<ToolDescriptor[]> {
    return this.deps.catalog.listTools({ agent, workdir: workdir || this.deps.workdir }).catch((e: any) => { this.deps.log?.(`[hub] listTools failed: ${e?.message || e}`); return []; });
  }
  listSkills(agent: string, workdir?: string): Promise<SkillDescriptor[]> {
    return this.deps.catalog.listSkills({ agent, workdir: workdir || this.deps.workdir }).catch((e: any) => { this.deps.log?.(`[hub] listSkills failed: ${e?.message || e}`); return []; });
  }

  // Resolve how to launch an agent's interactive TUI (with model injection applied),
  // without spawning it — the caller (launcher / Loom.runTui) owns the PTY.
  async resolveTui(opts: { agent?: string; workdir?: string; model?: string | null; sessionId?: string | null }): Promise<TuiSpec> {
    const agent = (opts.agent || this.deps.defaultAgent || '').trim();
    const driver = this.deps.drivers.get(agent);
    if (!driver) throw new Error(`No driver registered for agent "${agent}"`);
    if (!driver.tui) throw new Error(`Driver "${agent}" does not support TUI mode`);
    const workdir = opts.workdir || this.deps.workdir;
    const injection = await this.deps.modelResolver.resolve(agent, { model: opts.model, profileId: null }).catch(() => null);
    const model = injection?.model ?? opts.model ?? null;
    // Same merge as run(), so the raw-PTY rail also gets plugin env/args (e.g. a hijack redirect).
    const pluginParts = await this.pluginSpawn(agent, workdir, 'tui', opts.sessionId ?? null, model);
    const spawn = this.mergeSpawn([{ env: injection?.env, extraArgs: injection?.extraArgs }, ...pluginParts]);
    return driver.tui({ workdir, model, sessionId: opts.sessionId ?? null, env: spawn.env, extraArgs: spawn.extraArgs });
  }

  async prompt(input: PromptInput): Promise<{ sessionKey: string; taskId: string }> {
    const agent = (input.agent || this.deps.defaultAgent || '').trim();
    const driver = this.deps.drivers.get(agent);
    if (!driver) throw new Error(`No driver registered for agent "${agent}"`);
    const workdir = input.workdir || this.deps.workdir;

    const resumeId = input.sessionKey ? splitSessionKey(input.sessionKey).sessionId : null;
    const preExisted = resumeId ? !!(await this.deps.sessionStore.get(agent, resumeId)) : false;
    const { sessionId, workspacePath } = await this.deps.sessionStore.ensure(agent, {
      sessionId: resumeId, workdir, title: input.prompt.slice(0, 80),
    });
    const sessionKey = makeSessionKey(agent, sessionId);

    const taskId = randomUUID();
    const runner = new SessionRunner(sessionKey, agent, taskId, (snap, seq) => this.onRunnerUpdate(sessionKey, snap, seq), this.deps.interactionHandler);
    this.runnersByTask.set(taskId, runner);
    const item: QueuedItem = { runner, taskId, input, driver, agent, sessionId, sessionKey, workdir, workspacePath, preExisted };

    // Per-session serial orchestration (default): one turn per session at a time. A prompt
    // for a busy session queues (surfaced in the active snapshot's `queued`) and promotes
    // when the running turn finishes — never clobbering the in-flight turn's snapshot.
    if (this.deps.serialPerSession !== false && this.active.has(sessionKey)) {
      this.enqueue(item);
    } else {
      void this.runNow(item);
    }
    return { sessionKey, taskId };
  }

  // Branch `fromSessionKey` at a turn boundary into a NEW managed session. Copies the kept
  // transcript prefix, pins the native keep-boundary NOW (so the branch is immune to the
  // parent continuing afterwards), and stamps a pendingFork the first prompt() dispatch
  // consumes (fork-on-dispatch). The parent — record, transcript, native store — is never
  // mutated. Works for sessions the kernel never ran: a native-only session's id IS its
  // native id (the same assumption prompt() makes when resuming one).
  async forkSession(input: ForkSessionInput): Promise<ForkSessionResult> {
    const { agent, sessionId: fromId } = splitSessionKey(input.fromSessionKey);
    const driver = this.deps.drivers.get(agent);
    if (!driver) throw new Error(`No driver registered for agent "${agent}"`);
    const parent = await this.deps.sessionStore.get(agent, fromId);
    const parentNativeId = parent?.nativeSessionId || fromId;
    const workdir = parent?.workdir || this.deps.workdir;

    // Kept transcript prefix: through atTaskId inclusive (default: the whole transcript).
    const turns = this.deps.sessionStore.history
      ? await this.deps.sessionStore.history(agent, fromId).catch(() => [] as UniversalSnapshot[])
      : [];
    const requested = input.atTaskId ? turns.findIndex(t => t.taskId === input.atTaskId) : turns.length - 1;
    if (input.atTaskId && requested < 0) throw new Error(`fork point ${input.atTaskId} not found in ${input.fromSessionKey}`);
    // A round the agent refused before writing anything (`turnLanded` false) is NOT a boundary:
    // no answer to inherit, and nothing in the agent's own store to anchor against. Cutting there
    // would copy a dead round into the branch AND force the seed fallback on a conversation that
    // has a perfectly good boundary one turn earlier — so step back to it and report what was
    // skipped. Applies to a tail fork too: trailing dead rounds are invisible to the agent, so a
    // branch that kept them would show turns its native context has never heard of.
    let cut = requested;
    while (cut >= 0 && !turnLanded(turns[cut])) cut--;
    const droppedTaskIds = turns.slice(cut + 1, requested + 1)
      .map(t => t.taskId).filter((id): id is string => !!id);
    const kept = turns.slice(0, cut + 1);
    // Stepping back past EVERY turn (a transcript whose rounds all died) leaves nothing to
    // inherit: there is no boundary, and the parent's native session — if it exists at all — holds
    // none of these rounds. Such a branch must start clean (seed with an empty prefix), never
    // resume the parent natively. Distinct from an empty transcript, which is the normal shape of
    // a native-only session the kernel never ran and whose tail fork is perfectly valid.
    const keptNothing = cut < 0 && turns.length > 0;
    // "Tail" is about what the AGENT sees: the caller asked for the parent's last turn, and
    // anything the step-back skipped never reached the native store — so the parent's current
    // native tip is still exactly this cut, and resolveNativeAnchor may pin it below.
    const cutIsTail = requested === turns.length - 1 && !keptNothing;

    // Pin the native keep-boundary at fork time: explicit override (only when the cut landed
    // where the caller asked — an override names ONE turn) → the caller's per-turn anchor map
    // → the kept turn's recorded anchor → the parent's CURRENT tail (tail cuts only). A mid cut
    // that can't be anchored falls back to a seed fork — a tail-anchored native fork there would
    // silently absorb the dropped turns, which is worse than the seed's lower fidelity.
    const cutTurn = kept[kept.length - 1] ?? null;
    const cutTaskId = cutTurn?.taskId ?? null;
    const overrideAnchor = droppedTaskIds.length ? null : input.anchor ?? null;
    const mappedAnchor = cutTaskId ? input.anchors?.[cutTaskId] ?? null : null;
    let anchor = overrideAnchor ?? mappedAnchor ?? cutTurn?.anchor ?? null;
    // An anchor the agent can no longer resolve is worse than none — claude fails the entire run
    // at `--resume-session-at`, so the branch would die on its first dispatch with nothing to
    // retry. Drop it: a tail cut re-pins the parent's current tip below, a mid cut seeds instead.
    if (anchor && !(await this.anchorStillResolvable(driver, parentNativeId, workdir, anchor))) {
      this.deps.log?.(`[hub] fork anchor ${anchor} no longer resolvable in ${input.fromSessionKey} — dropping it`);
      anchor = null;
    }
    if (!anchor && cutIsTail && driver.resolveNativeAnchor) {
      try { anchor = (await driver.resolveNativeAnchor({ sessionId: parentNativeId, workdir })) ?? null; }
      catch { anchor = null; }
    }
