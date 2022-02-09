import type { Bot, ChatId, Agent, SessionRuntime } from './bot.js';
import { normalizeAgent } from './bot.js';
import { getDriverCapabilities } from '../agent/driver.js';
import { getSessionStatusForChat } from './session-status.js';
import {
  getAgentsListData,
  getModelsListData,
  getSessionsPageData,
  getSkillsListData,
  summarizeSessionRun,
  modelMatchesSelection,
  resolveSkillPrompt,
} from './commands.js';
import {
  accountAgentSupported,
  listAccounts,
  getAccount,
  getActiveAccountId,
  setActiveAccount,
  warmAccountUsages,
  accountUsageSummary,
} from '../agent/accounts.js';

export type CommandAction =
  | { kind: 'sessions.page'; page: number }
  | { kind: 'session.new' }
  | { kind: 'session.switch'; sessionId: string }
  | { kind: 'agent.switch'; agent: Agent }
  | { kind: 'agent.account.set'; agent: Agent; accountId: string | null }
  | { kind: 'model.switch'; modelId: string }
  | { kind: 'effort.set'; effort: string }
  | { kind: 'models.select.model'; modelId: string; profileId?: string | null }
  | { kind: 'models.select.effort'; effort: string }
  | { kind: 'models.confirm' }
  | { kind: 'skill.run'; command: string }
  | { kind: 'mode.switch'; mode: string }
  | { kind: 'workflow.toggle'; enabled: boolean };

export type CommandItemState = 'default' | 'current' | 'running' | 'unavailable';

export interface CommandActionButton {
  label: string;
  action: CommandAction;
  state?: CommandItemState;
  primary?: boolean;
}

export interface CommandSelectionItem {
  label: string;
  detail?: string | null;
  state?: CommandItemState;
}

export interface CommandSelectionView {
  kind: 'sessions' | 'agents' | 'models' | 'skills' | 'mode';
  title: string;
  detail?: string | null;
  metaLines: string[];
  items: CommandSelectionItem[];
  emptyText?: string | null;
  helperText?: string | null;
  rows: CommandActionButton[][];
}

export interface CommandNotice {
  title: string;
  value?: string | null;
  detail?: string | null;
  valueMode?: 'code' | 'plain';
}

export type CommandActionResult =
  | { kind: 'view'; view: CommandSelectionView; callbackText?: string | null }
  | { kind: 'notice'; notice: CommandNotice; callbackText?: string | null; session?: SessionRuntime | null; previewSession?: { agent: Agent; sessionId: string | null } | null }
  | { kind: 'skill'; prompt: string; skillName: string; callbackText?: string | null }
  | { kind: 'noop'; message: string };

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  const size = Math.max(1, columns);
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function buttonStateFromFlags(opts: { isCurrent?: boolean; isRunning?: boolean; unavailable?: boolean }): CommandItemState {
  if (opts.unavailable) return 'unavailable';
  if (opts.isRunning) return 'running';
  if (opts.isCurrent) return 'current';
  return 'default';
}

export function encodeCommandAction(action: CommandAction): string {
  switch (action.kind) {
    case 'sessions.page':
      return `sp:${Math.max(0, action.page)}`;
    case 'session.new':
      return 'sess:new';
    case 'session.switch':
      return `sess:${action.sessionId}`;
    case 'agent.switch':
      return `ag:${action.agent}`;
    case 'agent.account.set':
      return `agacc:${action.agent}:${action.accountId ?? ''}`;
    case 'model.switch':
      return `mod:${action.modelId}`;
    case 'effort.set':
      return `eff:${action.effort}`;
    case 'models.select.model':
      return action.profileId
        ? `md:p:${action.profileId}:${action.modelId}`
        : `md:n:${action.modelId}`;
    case 'models.select.effort':
      return `ed:${action.effort}`;
    case 'models.confirm':
      return 'mc';
    case 'skill.run':
      return `skr:${action.command}`;
    case 'mode.switch':
      return `pm:${action.mode}`;
    case 'workflow.toggle':
      return `wf:${action.enabled ? 1 : 0}`;
  }
}

export function decodeCommandAction(data: string): CommandAction | null {
  if (data === 'sess:new') return { kind: 'session.new' };
  if (data.startsWith('sp:')) {
    const page = Number.parseInt(data.slice(3), 10);
    if (!Number.isFinite(page) || page < 0) return null;
    return { kind: 'sessions.page', page };
  }
  if (data.startsWith('sess:')) {
    const sessionId = data.slice(5);
    if (!sessionId) return null;
    return { kind: 'session.switch', sessionId };
  }
  if (data.startsWith('agacc:')) {
    const rest = data.slice(6);
    const sep = rest.indexOf(':');
    if (sep < 0) return null;
