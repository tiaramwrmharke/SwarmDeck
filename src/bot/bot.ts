import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { getActiveUserConfig, loadWorkspaces, onUserConfigChange, resolveUserWorkdir, setUserWorkdir, updateUserConfig } from '../core/config/user-config.js';
import {
  doStream, ensureManagedSession, findManagedThreadSession, getSessionStoredConfig, getUsage, initializeProjectSkills, listAgents, resolveAgentModels, resolveDefaultAgent, listSkills, stageSessionFiles,
  reconcileOrphanedRunningSessions, getAgentBoundModelId, setAgentBoundModelId, collapseSkillPrompt,
  readGoal, accountTurn, shouldContinueAfterTurn, renderContinuationPrompt, renderBudgetLimitPrompt,
  bumpContinuationCount, pauseGoal, resumeGoal, setGoal as setGoalState, clearGoal as clearGoalState,
  setCodexGoal, getCodexGoal, clearCodexGoal, pauseCodexGoal, resumeCodexGoal,
  getClaudeNativeGoal, buildClaudeSetGoalPrompt, buildClaudeClearGoalPrompt,
  deliverArtifact, attachmentUrl, attachAgentImage, rewriteAttachmentBlocksForTransport,
  type Agent, type CodexCumulativeUsage, type StreamOpts, type StreamResult, type StreamPreviewMeta, type StreamPreviewPlan, type StreamSubAgent, type SessionInfo, type UsageResult,
  type AgentInteraction, type CodexTurnControl,
  type ModelInfo, type ModelListResult, type TailMessage, type SessionTailResult,
  type SkillInfo, type SkillListResult, type AgentDetectOptions, isPendingSessionId,
  type SessionClassification, type SessionMessagesOpts, type SessionMessagesResult,
  type ThreadGoal, type GoalStatus, type CodexThreadGoal, type ClaudeNativeGoal,
  type HandoverRef, type MessageBlock,
} from '../agent/index.js';
import { compactForHandover, describeHandoverRef } from '../agent/handover.js';
import { getActiveProfileId, getActiveProfile, setActiveProfile, getProfile } from '../model/index.js';
import {
  querySessions, querySessionTail, updateSession,
  type SessionQueryResult,
} from './session-hub.js';
import { getDriver, hasDriver, allDriverIds, getDriverCapabilities } from '../agent/driver.js';
import { resolveGuiIntegrationConfig, type McpSendFileCallback, type McpSendFileResult } from '../agent/mcp/bridge.js';
import { composeSessionToolPrompt } from '../agent/mcp/capabilities.js';
import { terminateProcessTree } from '../core/process-control.js';
import { appendTurnAudit } from '../core/turn-audit.js';
import { recordDeliveredTurn } from '../agent/turn-snapshot.js';
import { expandTilde } from '../core/platform.js';
import { VERSION } from '../core/version.js';
import {
  type HumanLoopPromptState, type HumanLoopQuestion, type ResolvedHumanLoopAnswers, type ResolvedHumanLoopStatus,
  buildHumanLoopResponse, createEmptyHumanLoopAnswer, currentHumanLoopQuestion,
  isHumanLoopAwaitingText, setHumanLoopOption, setHumanLoopText, skipHumanLoopQuestion,
  summarizeResolvedHumanLoopAnswers,
} from './human-loop.js';
import { writeScopedLog, type LogLevel } from '../core/logging.js';
import {
  resolveAgentEffort,
  resolveAgentModel,
  resolveClaudeAccessMode,
  DEFAULT_CLAUDE_ACCESS_MODE,
  type ClaudeAccessMode,
} from '../core/config/runtime-config.js';
import {
  envBool, envString, envInt, shellSplit, whichSync,
  fmtTokens, fmtUptime, fmtBytes,
  parseAllowedChatIds, listSubdirs,
  extractThinkingTail, formatThinkingForDisplay,
  buildPrompt, ensureGitignore,
  type ChatId,
} from '../core/utils.js';
import {
  getHostBatteryData, getHostCpuUsageData, getHostDisplayName, getHostMemoryUsageData,
  type HostBatteryData, type HostCpuUsageData, type HostMemoryUsageData,
} from './host.js';

export { updateSession, type Agent, type CodexCumulativeUsage, type StreamResult, type StreamPreviewMeta, type StreamPreviewPlan, type StreamSubAgent, type SessionInfo, type UsageResult, type AgentInteraction, type ModelInfo, type ModelListResult, type TailMessage, type SessionTailResult, type SkillInfo, type SkillListResult, type SessionClassification, type SessionMessagesOpts, type SessionMessagesResult, type SessionQueryResult };
export { envBool, envString, envInt, shellSplit, whichSync, fmtTokens, fmtUptime, fmtBytes, parseAllowedChatIds, listSubdirs, extractThinkingTail, formatThinkingForDisplay, buildPrompt, ensureGitignore, type ChatId } from '../core/utils.js';
export { getHostBatteryData, getHostCpuUsageData, getHostDisplayName, getHostMemoryUsageData, type HostBatteryData, type HostCpuUsageData, type HostMemoryUsageData } from './host.js';
export { readGitStatus, formatGitStatusLine, type GitStatus } from '../core/git.js';
import { BOT_TIMEOUTS } from '../core/constants.js';
import { queuedIdsToDeferForSteer } from './queue-steer.js';

export const DEFAULT_RUN_TIMEOUT_S = BOT_TIMEOUTS.defaultRunTimeoutS;
const MACOS_USER_ACTIVITY_PULSE_INTERVAL_MS = BOT_TIMEOUTS.macosUserActivityPulseInterval;
const MACOS_USER_ACTIVITY_PULSE_TIMEOUT_S = BOT_TIMEOUTS.macosUserActivityPulseTimeoutS;

export function normalizeAgent(raw: string): Agent {
  const v = raw.trim().toLowerCase();
  if (!hasDriver(v)) throw new Error(`Invalid agent: ${v}. Use: ${allDriverIds().join(', ')}`);
  return v;
}

export function thinkLabel(agent: Agent): string {
  try { return getDriver(agent).thinkLabel; } catch { return 'Thinking'; }
}

function appendExtraPrompt(base: string | undefined, extra: string): string {
  const lhs = String(base || '').trim();
  const rhs = String(extra || '').trim();
  if (!lhs) return rhs;
  if (!rhs) return lhs;
  return `${lhs}\n\n${rhs}`;
}

function buildBrowserAutomationPrompt(browserEnabled: boolean): string {
  if (!browserEnabled) {
    return [
      '[Browser Automation]',
      'Managed browser automation is disabled by default for this session.',
      process.platform === 'darwin'
        ? 'On macOS, operate your main browser directly with native commands such as open, osascript, and screencapture when needed.'
        : 'Use native OS or browser commands directly when browser automation is not enabled.',
    ].join('\n');
  }
  return [
    '[Browser Automation]',
    'A Playwright MCP browser server is already configured to use the local Chrome channel with a persistent profile.',
    'Do not call browser_install unless a browser tool explicitly reports that Chrome or the browser is missing.',
    'If you need a new tab, use browser_tabs with action="new".',
  ].join('\n');
}

function buildWorkflowOptInPrompt(): string {
  return [
    '[Multi-agent Workflow]',
    'Workflow orchestration is enabled for this session. For substantial multi-step work — broad research, large refactors or audits, fan-out reviews across many files — you may proactively author and run a Workflow to decompose and parallelise it.',
    'Keep it proportional: do NOT orchestrate trivial or single-file tasks. When a workflow would not add value, just answer directly as a single agent. Workflows can spawn many sub-agents and consume significant tokens, so reserve them for work whose scale genuinely warrants the fan-out.',
  ].join('\n');
}

export interface ChatState {
  agent: Agent;
  sessionId: string | null;
  workspacePath?: string | null;
  codexCumulative?: CodexCumulativeUsage;
  modelId?: string | null;
  activeSessionKey?: string | null;
  activeThreadId?: string | null;
  workdir?: string | null;
  pendingHandoverFrom?: HandoverRef | null;
}

export interface SessionRuntime {
  key: string;
  workdir: string;
  agent: Agent;
  sessionId: string | null;
  workspacePath: string | null;
  threadId: string | null;
  codexCumulative?: CodexCumulativeUsage;
  modelId?: string | null;
  thinkingEffort?: string | null;
  runningTaskIds: Set<string>;
  handoverFrom?: HandoverRef | null;
}

export interface InteractionSnapshot {
  promptId: string;
  kind: 'user-input' | 'permission' | 'confirmation';
  title: string;
  hint?: string | null;
  questions: AgentInteraction['questions'];
  currentIndex?: number;
}

export interface SnapshotArtifact {
  url: string;
  fileName: string;
  fileSize: number;
  mime: string;
  kind: 'photo' | 'document';
  caption?: string;
}

export type StreamEvent =
  | { type: 'start'; taskId: string; agent: string; sessionId: string | null; model: string | null; effort: string | null }
  | { type: 'text'; text: string; thinking: string; activity?: string; plan?: StreamPreviewPlan | null; previewMeta?: StreamPreviewMeta | null }
  | { type: 'artifact'; artifact: SnapshotArtifact }
  | { type: 'done'; taskId: string; sessionId: string | null; error?: string; incomplete?: boolean }
  | { type: 'queued'; taskId: string; position: number }
  | { type: 'cancelled'; taskId: string }
  | { type: 'interaction'; taskId: string; interaction: InteractionSnapshot }
  | { type: 'interaction-resolved'; promptId: string };

export interface StreamSnapshot {
  phase: 'queued' | 'streaming' | 'done';
  taskId: string;
  queuedTaskIds?: string[];
  queuedTasks?: Array<{ taskId: string; prompt: string; attachments?: MessageBlock[] }>;
  question?: string | null;
  questionBlocks?: MessageBlock[];
  incomplete?: boolean;
  text?: string;
  thinking?: string;
  activity?: string;
  plan?: StreamPreviewPlan | null;
  sessionId?: string | null;
  model?: string | null;
  effort?: string | null;
  previewMeta?: StreamPreviewMeta | null;
  error?: string;
  artifacts?: SnapshotArtifact[];
  interactions?: InteractionSnapshot[];
  startedAt?: number;
  updatedAt: number;
}

export interface RunningTask {
  taskId: string;
  actionId?: string;
  chatId: ChatId;
  agent: Agent;
  sessionKey: string;
  prompt: string;
  attachments?: string[];
  startedAt: number;
  sourceMessageId: number | string;
  status?: 'queued' | 'running';
  cancelled?: boolean;
  abort?: (() => void) | null;
  steer?: ((prompt: string, attachments?: string[]) => Promise<boolean>) | null;
  freezePreviewOnAbort?: boolean;
  placeholderMessageIds?: Array<number | string>;
  deferForSteer?: boolean;
}

export interface SessionGoalView {
  source: 'swarmdeck' | 'codex' | 'claude';
  objective: string;
  status: GoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  continuationCount: number | null;
}

function normalizeFromSwarmDeck(goal: ThreadGoal): SessionGoalView {
  return {
    source: 'swarmdeck',
    objective: goal.objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    continuationCount: goal.continuationCount,
  };
}

function normalizeFromCodex(goal: CodexThreadGoal): SessionGoalView {
  return {
    source: 'codex',
    objective: goal.objective,
    status: goal.status === 'budgetLimited' ? 'budget_limited' : goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    continuationCount: null,
  };
}

function normalizeFromClaudeNative(goal: ClaudeNativeGoal): SessionGoalView {
  return {
    source: 'claude',
    objective: goal.condition,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationCount: null,
  };
}

export interface BeginHumanLoopPromptOpts {
  taskId: string;
  chatId: ChatId;
  title: string;
  detail?: string | null;
  hint?: string | null;
  questions: HumanLoopQuestion[];
  resolveWith: (answers: Record<string, string[]>) => Record<string, any> | null;
  silent?: boolean;
}

export interface ActiveHumanLoopPrompt {
  prompt: HumanLoopPromptState<ChatId>;
  result: Promise<Record<string, any> | null>;
}

export interface SubmitSessionTaskOpts {
  agent: Agent;
  sessionId: string;
  workdir: string;
  prompt: string;
  attachments?: string[];
  modelId?: string | null;
  profileId?: string | null;
  thinkingEffort?: string | null;
  workflowEnabled?: boolean;
  sourceMessageId?: number | string;
  chatId?: ChatId;
  handoverFrom?: HandoverRef | null;
  goalContinuation?: { kind: 'continuation' | 'budget_wrapup'; goalId: string };
  forkOf?: { parentSessionId: string; atTurn: number };
  onText?: (
    text: string,
    thinking: string,
    activity?: string,
    meta?: StreamPreviewMeta,
    plan?: StreamPreviewPlan | null,
  ) => void;
}

interface RunStreamExtras {
  forkOf?: { parentSessionId: string; atTurn: number };
  workflowEnabled?: boolean;
  profileId?: string | null;
  onPreparedPrompt?: (prompt: string) => void;
}

export interface SubmittedSessionTask {
  ok: true;
  taskId: string;
  sessionKey: string;
  queued: true;
}

export interface ImTaskPresenterOpts {
  chatId: ChatId;
  taskId: string;
  session: SessionRuntime;
  agent: Agent;
  prompt: string;
  attachments: string[];
}

export interface ImTaskPresenter {
  onText: (
    text: string,
    thinking: string,
    activity?: string,
    meta?: StreamPreviewMeta,
    plan?: StreamPreviewPlan | null,
  ) => void;
  onSuccess: (result: StreamResult) => Promise<void>;
  onFailure: (error: string) => Promise<void>;
  dispose: () => void;
}

export class Bot {
  workdir: string;
  defaultAgent: Agent;
  runTimeout: number;
  allowedChatIds: Set<ChatId>;

  agentConfigs: Record<string, Record<string, any>> = {};

  get codexModel(): string { return this.agentConfigs.codex?.model || ''; }
  set codexModel(v: string) { this.agentConfigs.codex.model = v; }
  get codexReasoningEffort(): string { return this.agentConfigs.codex?.reasoningEffort || 'xhigh'; }
  set codexReasoningEffort(v: string) { this.agentConfigs.codex.reasoningEffort = v; }
  get codexFullAccess(): boolean { return this.agentConfigs.codex?.fullAccess ?? true; }
  get codexExtraArgs(): string[] { return this.agentConfigs.codex?.extraArgs || []; }
  get claudeModel(): string { return this.agentConfigs.claude?.model || ''; }
  set claudeModel(v: string) { this.agentConfigs.claude.model = v; }
  get claudePermissionMode(): string { return this.agentConfigs.claude?.permissionMode || 'bypassPermissions'; }
  get claudeExtraArgs(): string[] { return this.agentConfigs.claude?.extraArgs || []; }
  get claudeWorkflowEnabled(): boolean { return this.agentConfigs.claude?.workflowEnabled ?? false; }
  get claudeAccessMode(): ClaudeAccessMode { return this.agentConfigs.claude?.accessMode || DEFAULT_CLAUDE_ACCESS_MODE; }
  get geminiApprovalMode(): string { return this.agentConfigs.gemini?.approvalMode || 'yolo'; }
  get geminiSandbox(): boolean { return this.agentConfigs.gemini?.sandbox ?? false; }
  get geminiExtraArgs(): string[] { return this.agentConfigs.gemini?.extraArgs || []; }

  chats = new Map<ChatId, ChatState>();
  sessionStates = new Map<string, SessionRuntime>();
  activeTasks = new Map<string, RunningTask>();
  startedAt = Date.now();
  connected = false;
  stats = { totalTurns: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCachedTokens: 0 };

  private streamSnapshots = new Map<string, StreamSnapshot>();
  private snapshotCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private promotedSessionKeys = new Map<string, string>();
  private promotedFromAliases = new Map<string, string[]>();

  private resolveSessionKey(sessionKey: string): string {
    let key = sessionKey;
    const seen = new Set<string>();
    while (!seen.has(key)) {
      const next = this.promotedSessionKeys.get(key);
      if (!next || next === key) break;
      seen.add(key);
      key = next;
    }
    return key;
  }

  private forgetPromotion(canonicalKey: string): void {
    const aliases = this.promotedFromAliases.get(canonicalKey);
    if (aliases) for (const alias of aliases) this.promotedSessionKeys.delete(alias);
    this.promotedFromAliases.delete(canonicalKey);
  }

  getStreamSnapshot(sessionKey: string): StreamSnapshot | null {
    const snap = this.streamSnapshots.get(this.resolveSessionKey(sessionKey));
    return snap ? this.enrichSnapshot(snap) : null;
  }

  private taskAttachmentBlocks(task: RunningTask | null | undefined): MessageBlock[] {
    if (!task?.attachments?.length) return [];
    const session = this.getSessionRuntimeByKey(task.sessionKey, { allowAnyWorkdir: true });
    const sessionId = session?.sessionId || task.sessionKey.slice(task.agent.length + 1);
    if (!sessionId) return [];
    const blocks = task.attachments
      .map(imagePath => attachAgentImage({ imagePath, inlineThresholdBytes: 0 }))
      .filter((block): block is MessageBlock => !!block);
    return blocks.length
      ? rewriteAttachmentBlocksForTransport(blocks, { agent: task.agent, sessionId })
      : [];
  }

  private taskPreview(taskId: string): { taskId: string; prompt: string; attachments?: MessageBlock[] } {
    const task = this.activeTasks.get(taskId) || null;
    const raw = task?.prompt || '';
    const attachments = this.taskAttachmentBlocks(task);
    return {
      taskId,
      prompt: collapseSkillPrompt(raw) ?? raw,
      ...(attachments.length ? { attachments } : {}),
    };
  }

  private enrichSnapshot(snap: StreamSnapshot): StreamSnapshot {
    let next = snap;
    const runningTask = next.taskId ? this.activeTasks.get(next.taskId) : null;
    const runningPrompt = runningTask?.prompt || '';
    if (runningPrompt) {
      const questionBlocks = this.taskAttachmentBlocks(runningTask);
      next = {
        ...next,
        question: collapseSkillPrompt(runningPrompt) ?? runningPrompt,
        ...(questionBlocks.length ? { questionBlocks } : {}),
      };
    }
    const queuedIds = [
      ...(next.phase === 'queued' && next.taskId ? [next.taskId] : []),
      ...(next.queuedTaskIds || []),
    ].filter((taskId, index, all) => taskId && all.indexOf(taskId) === index);
    if (queuedIds.length) {
      const queuedTasks = queuedIds.map(taskId => this.taskPreview(taskId));
      next = { ...next, queuedTasks };
    }
    if (next.interactions?.length) {
      const refreshed = next.interactions.map(snapshotEntry => {
        const live = this.humanLoopPrompts.get(snapshotEntry.promptId);
        if (!live) return snapshotEntry;
        return { ...snapshotEntry, currentIndex: live.currentIndex };
      });
      next = { ...next, interactions: refreshed };
    }
    return next;
  }

  private updateTaskPrompt(taskId: string, fallbackKey: string, prompt: string) {
    const task = this.activeTasks.get(taskId);
    const prepared = prompt.trim();
    if (!task || !prepared || task.prompt === prepared) return;
    task.prompt = prepared;

    const key = this.liveSessionKey(taskId, fallbackKey);
    const snap = this.streamSnapshots.get(key);
    if (snap) {
      snap.updatedAt = Date.now();
      this.pushSnapshotToSSE(key, true);
    }
  }

  private _onStreamSnapshot: ((sessionKey: string, snapshot: StreamSnapshot | null) => void) | null = null;
  private streamPushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private streamPushPending = new Map<string, boolean>();

  onStreamSnapshot(cb: (sessionKey: string, snapshot: StreamSnapshot | null) => void): void {
    this._onStreamSnapshot = cb;
  }

  private pushSnapshotToSSE(sessionKey: string, immediate: boolean) {
    if (!this._onStreamSnapshot) return;
    const snap = this.streamSnapshots.get(sessionKey) ?? null;
    const cb = this._onStreamSnapshot;
    const emitAll = () => {
      const enriched = snap ? this.enrichSnapshot(snap) : null;
      cb(sessionKey, enriched);
      const aliases = this.promotedFromAliases.get(sessionKey);
      if (aliases) for (const alias of aliases) cb(alias, enriched ? { ...enriched } : null);
    };
    if (immediate) {
      const timer = this.streamPushTimers.get(sessionKey);
      if (timer) { clearTimeout(timer); this.streamPushTimers.delete(sessionKey); }
      this.streamPushPending.delete(sessionKey);
      emitAll();
    } else {
      this.streamPushPending.set(sessionKey, true);
      if (this.streamPushTimers.has(sessionKey)) return;
      this.streamPushTimers.set(sessionKey, setTimeout(() => {
        this.streamPushTimers.delete(sessionKey);
        if (this.streamPushPending.get(sessionKey)) {
          this.streamPushPending.delete(sessionKey);
          emitAll();
        }
      }, 80));
    }
  }

  emitStream(sessionKey: string, event: StreamEvent) {
    const pending = this.snapshotCleanupTimers.get(sessionKey);
    if (pending) { clearTimeout(pending); this.snapshotCleanupTimers.delete(sessionKey); }

    const now = Date.now();
    switch (event.type) {
      case 'queued': {
        const existing = this.streamSnapshots.get(sessionKey);
        if (existing && existing.phase === 'streaming') {
          const list = existing.queuedTaskIds ? [...existing.queuedTaskIds] : [];
          if (existing.taskId !== event.taskId && !list.includes(event.taskId)) list.push(event.taskId);
          existing.queuedTaskIds = list.length ? list : undefined;
          existing.updatedAt = now;
        } else if (existing && existing.phase === 'done') {
          this.streamSnapshots.set(sessionKey, { phase: 'queued', taskId: event.taskId, updatedAt: now });
        } else if (existing && existing.phase === 'queued') {
          const list = existing.queuedTaskIds ? [...existing.queuedTaskIds] : [];
          if (existing.taskId !== event.taskId && !list.includes(event.taskId)) list.push(event.taskId);
          existing.queuedTaskIds = list.length ? list : undefined;
          existing.updatedAt = now;
        } else {
          this.streamSnapshots.set(sessionKey, { phase: 'queued', taskId: event.taskId, updatedAt: now });
        }
        break;
      }
      case 'start': {
        const prev = this.streamSnapshots.get(sessionKey);
        const remainingQueued = prev?.queuedTaskIds?.filter(id => id !== event.taskId);
        this.streamSnapshots.set(sessionKey, {
          phase: 'streaming', taskId: event.taskId,
          text: '', thinking: '', activity: '', plan: null, sessionId: event.sessionId, updatedAt: now,
          model: event.model, effort: event.effort, previewMeta: null,
          startedAt: now,
          queuedTaskIds: remainingQueued && remainingQueued.length ? remainingQueued : undefined,
        });
        break;
      }
      case 'text': {
        const snap = this.streamSnapshots.get(sessionKey);
        if (snap) {
          snap.text = event.text;
          snap.thinking = event.thinking;
          snap.activity = event.activity;
          snap.plan = event.plan?.steps?.length ? event.plan : null;
          if (event.previewMeta) snap.previewMeta = event.previewMeta;
          snap.updatedAt = now;
        }
        break;
      }
      case 'artifact': {
        const snap = this.streamSnapshots.get(sessionKey);
        if (snap) {
          snap.artifacts = [...(snap.artifacts || []), event.artifact];
          snap.updatedAt = now;
        }
        break;
      }
      case 'done': {
        const prev = this.streamSnapshots.get(sessionKey);
        this.streamSnapshots.set(sessionKey, {
          phase: 'done',
          taskId: event.taskId,
          sessionId: event.sessionId,
          incomplete: !!event.incomplete,
          text: prev?.text || '',
          thinking: prev?.thinking || '',
          activity: prev?.activity || '',
          error: event.error,
          plan: prev?.plan ?? null,
          model: prev?.model ?? null,
          effort: prev?.effort ?? null,
          previewMeta: prev?.previewMeta ?? null,
          artifacts: prev?.artifacts,
          startedAt: prev?.startedAt,
          queuedTaskIds: prev?.queuedTaskIds,
          updatedAt: now,
        });
        this.snapshotCleanupTimers.set(sessionKey, setTimeout(() => {
          this.streamSnapshots.delete(sessionKey);
          this.snapshotCleanupTimers.delete(sessionKey);
          this.forgetPromotion(sessionKey);
        }, 30_000));
        break;
      }
      case 'cancelled': {
        const snap = this.streamSnapshots.get(sessionKey);
        if (!snap) break;
        if (snap.queuedTaskIds?.includes(event.taskId)) {
          const next = snap.queuedTaskIds.filter(id => id !== event.taskId);
          snap.queuedTaskIds = next.length ? next : undefined;
          snap.updatedAt = now;
        } else if (snap.taskId === event.taskId) {
          this.streamSnapshots.delete(sessionKey);
          this.forgetPromotion(sessionKey);
        }
        break;
      }
      case 'interaction': {
        const snap = this.streamSnapshots.get(sessionKey);
        if (snap) {
          const list = snap.interactions || [];
          list.push(event.interaction);
          snap.interactions = list;
          snap.updatedAt = now;
        }
        break;
      }
      case 'interaction-resolved': {
        const snap = this.streamSnapshots.get(sessionKey);
        if (snap?.interactions) {
          snap.interactions = snap.interactions.filter(i => i.promptId !== event.promptId);
          if (!snap.interactions.length) delete snap.interactions;
          snap.updatedAt = now;
        }
        break;
      }
    }

    try {
      this.pushSnapshotToSSE(sessionKey, event.type !== 'text');
    } catch {  }
  }

  private liveSessionKey(taskId: string, fallback: string): string {
    return this.activeTasks.get(taskId)?.sessionKey || fallback;
  }

  protected emitStreamQueued(sessionKey: string, taskId: string) {
    this.emitStream(sessionKey, { type: 'queued', taskId, position: this.getQueuePosition(sessionKey, taskId) });
  }

  protected emitStreamStart(
    taskId: string,
    session: Pick<SessionRuntime, 'key' | 'agent' | 'sessionId' | 'workdir' | 'modelId' | 'thinkingEffort'>,
    opts?: { workflowEnabled?: boolean },
  ) {
    const cfg = this.resolveSessionStreamConfig(session, opts);
    const key = this.liveSessionKey(taskId, session.key);
    this.debug(`[stream-lifecycle] start task=${taskId} key=${key} sessionId=${session.sessionId || '(pending)'} model=${cfg.model || '-'}`);
    this.emitStream(key, {
      type: 'start', taskId, agent: session.agent, sessionId: session.sessionId,
      model: cfg.model, effort: cfg.effort,
    });
  }

  protected emitStreamText(
    taskId: string,
    fallbackKey: string,
    text: string,
    thinking: string,
    activity = '',
    meta?: StreamPreviewMeta,
    plan?: StreamPreviewPlan | null,
  ) {
    const key = this.liveSessionKey(taskId, fallbackKey);
    const snap = this.streamSnapshots.get(key);
    this.debug(`[stream-lifecycle] text task=${taskId} key=${key} bytes=${text.length}/${thinking.length} snap=${snap ? snap.phase : 'NONE'}`);
    this.emitStream(key, {
      type: 'text', text, thinking, activity, plan: plan ?? null, previewMeta: meta ?? null,
    });
  }
