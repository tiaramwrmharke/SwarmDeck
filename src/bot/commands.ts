import path from 'node:path';
import fs from 'node:fs';
import type { Bot, ChatId, Agent, SessionInfo, SessionRuntime, ChatState, StreamResult } from './bot.js';
import { fmtTokens, fmtUptime, fmtBytes } from './bot.js';
import {
  getProjectSkillPaths, normalizeClaudeModelId, sessionListDisplayTitle,
  listAllMcpExtensions, listSkills as listAllSkills, isSystemInjectedUserText,
} from '../agent/index.js';
import { getDriver } from '../agent/driver.js';
import type { UsageResult } from '../agent/index.js';
import {
  accountAgentSupported, listAccounts, getActiveAccountId,
  getCachedAccountUsage, getAccountsUsageSnapshot,
} from '../agent/accounts.js';
import { withTimeoutFallback } from '../core/utils.js';
import { effortOptionsFor } from '../core/config/runtime-config.js';
import { getActiveProfile, getProvider } from '../model/index.js';
import { buildWelcomeIntro, buildSkillCommandName, indexSkillsByCommand, SKILL_CMD_PREFIX } from './menu.js';
import { buildBotMenuState } from './orchestration.js';
import { summarizePromptForStatus } from './streaming.js';
import { getSessionStatusForChat } from './session-status.js';
import { loadWorkspaces } from '../core/config/user-config.js';
import { VERSION } from '../core/version.js';
import { readGitStatus, type GitStatus } from '../core/git.js';

export interface AgentDetail {
  agent: Agent;
  model: string;
  effort: string | null;
}

export interface StartData {
  title: string;
  subtitle: string;
  version: string;
  agent: Agent;
  workdir: string;
  agentDetails: AgentDetail[];
  commands: Array<{ command: string; description: string }>;
}

export function getStartData(bot: Bot, chatId: ChatId): StartData {
  const cs = bot.chat(chatId);
  const intro = buildWelcomeIntro(VERSION);
  const commands = buildBotMenuState(bot).commands;
  const res = bot.fetchAgents();
  const agentDetails: AgentDetail[] = res.agents
    .filter(a => a.installed)
    .map(a => ({
      agent: a.agent,
      model: bot.modelForAgent(a.agent) || '(default)',
      effort: bot.effortSelectionForAgent(a.agent),
    }));
  return {
    ...intro,
    agent: cs.agent,
    workdir: bot.chatWorkdir(chatId),
    agentDetails,
    commands,
  };
}

export interface WorkspaceQuickPick {
  path: string;
  name: string;
  isCurrent: boolean;
  exists: boolean;
}

export interface WorkspacesData {
  currentWorkdir: string;
  workspaces: WorkspaceQuickPick[];
}

export function getWorkspacesData(bot: Bot, chatId: ChatId): WorkspacesData {
  const currentWorkdir = path.resolve(bot.chatWorkdir(chatId));
  const entries = loadWorkspaces();
  const workspaces = entries
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map<WorkspaceQuickPick>(w => {
      const resolved = path.resolve(w.path);
      let exists = false;
      try { exists = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory(); } catch { exists = false; }
      return {
        path: resolved,
        name: w.name || path.basename(resolved),
        isCurrent: resolved === currentWorkdir,
        exists,
      };
    });
  return { currentWorkdir, workspaces };
}

export async function handleGoalCommand(bot: Bot, chatId: ChatId, rawArgs: string): Promise<string | null> {
  const session = bot.selectedSession(chatId);
  if (!session || !session.sessionId) return null;
  const args = rawArgs.trim();
  const workdir = session.workdir;
  const agent = session.agent;
  const sessionId = session.sessionId;

  if (!args) {
    const goal = await bot.getSessionGoal(workdir, agent, sessionId);
    return formatGoalStatusLine(goal, agent);
  }

  const lower = args.toLowerCase();
  try {
    if (lower === 'pause') {
      const goal = await bot.pauseSessionGoal(workdir, agent, sessionId);
      if (!goal) return 'No goal set for this session.';
      return `Paused goal: ${truncate(goal.objective, 80)}`;
    }
    if (lower === 'resume') {
      const goal = await bot.resumeSessionGoal(workdir, agent, sessionId, { chatId });
      if (!goal) return 'No goal to resume.';
      if (goal.status !== 'active') return `Cannot resume goal (status: ${goal.status}).`;
      return `Resumed goal: ${truncate(goal.objective, 80)}`;
    }
    if (lower === 'clear' || lower === 'cancel' || lower === 'stop') {
      await bot.clearSessionGoal(workdir, agent, sessionId, { chatId });
      return agent === 'claude'
        ? 'Submitted `/goal clear` to claude. (Native /goal auto-clears once the condition is met, so this is only needed to stop early.)'
        : 'Cleared goal.';
    }

    const { objective, tokenBudget } = parseObjective(args);
    if (!objective) return 'Usage: /goal <objective>  (or pause / resume / clear)';
    if (agent === 'claude' && tokenBudget != null) {
      return 'Claude native /goal does not support `budget=N` — drop the budget prefix. (Use a codex session if you need a token budget.)';
    }
    const goal = await bot.setSessionGoal(workdir, agent, sessionId, {
      objective,
      tokenBudget,
      chatId,
    });
    const budgetLabel = goal.tokenBudget != null ? `, budget ${goal.tokenBudget} tokens` : '';
    if (agent === 'codex') {
      return [
        `Goal set (codex native)${budgetLabel}: ${truncate(goal.objective, 120)}`,
        'Send any message to trigger codex\'s native continuation loop. Each message resumes the thread and codex audits / continues until it marks the goal complete or hits the budget.',
      ].join('\n');
    }
    if (agent === 'claude') {
      return [
        `Goal set (claude native): ${truncate(goal.objective, 120)}`,
        'Claude\'s in-process Stop hook keeps working until a Haiku judge confirms the condition is met, then auto-clears. Send `/goal clear` to stop early; `/goal` to inspect.',
      ].join('\n');
    }
    return `Goal set${budgetLabel}: ${truncate(goal.objective, 120)}\nThe agent will keep working until it audits the objective complete${goal.tokenBudget != null ? ' or exhausts the budget' : ''}.`;
  } catch (e: any) {
    return `Failed: ${e?.message || e}`;
  }
}

function formatGoalStatusLine(goal: Awaited<ReturnType<Bot['getSessionGoal']>>, agent: Agent): string {
  if (!goal) return 'No goal set for this session. Use `/goal <objective>` to set one.';
  if (goal.source === 'claude') {
    return [
      `Goal: ${truncate(goal.objective, 200)}`,
      `Status: ${goal.status}  ·  claude native (Stop hook, auto-clears on completion)`,
    ].join('\n');
  }
  const budget = goal.tokenBudget != null
    ? `${goal.tokensUsed}/${goal.tokenBudget} tokens`
    : `${goal.tokensUsed} tokens (no budget)`;
  const continuations = goal.continuationCount != null ? `  ·  ${goal.continuationCount} continuations` : '';
  const engine = goal.source === 'codex' ? '  ·  codex native' : '';
  return [
    `Goal: ${truncate(goal.objective, 200)}`,
    `Status: ${goal.status}  ·  ${budget}${continuations}  ·  ${goal.timeUsedSeconds}s elapsed${engine}`,
  ].join('\n');
}

function parseObjective(args: string): { objective: string; tokenBudget: number | null } {
  const m = args.match(/^budget=(\d+)\s+(.+)$/i);
  if (m) {
    const tokenBudget = Number.parseInt(m[1], 10);
    return { objective: m[2].trim(), tokenBudget: Number.isFinite(tokenBudget) && tokenBudget > 0 ? tokenBudget : null };
  }
  return { objective: args, tokenBudget: null };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
