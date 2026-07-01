import type { Bot, ChatId, SessionRuntime } from './bot.js';
import { buildDefaultMenuCommands } from './menu.js';
import { BOT_SHUTDOWN_FORCE_EXIT_MS as _BOT_SHUTDOWN_FORCE_EXIT_MS } from '../core/constants.js';

export const BOT_SHUTDOWN_FORCE_EXIT_MS = _BOT_SHUTDOWN_FORCE_EXIT_MS;

export interface BotMenuState {
  commands: ReturnType<typeof buildDefaultMenuCommands>;
  skillCount: number;
}

export function buildBotMenuState(bot: Pick<Bot, 'fetchAgents' | 'fetchSkills'>): BotMenuState {
  const agents = bot.fetchAgents().agents;
  const installedCount = agents.filter(agent => agent.installed).length;
  const skills = bot.fetchSkills().skills;
  return {
    commands: buildDefaultMenuCommands(installedCount, skills),
    skillCount: skills.length,
  };
}

export function buildSessionTaskId(session: Pick<SessionRuntime, 'key'>, seq: number, now = Date.now()): string {
  return `${session.key}:${now.toString(36)}:${seq.toString(36)}`;
}

export function buildKnownChatEnv(
  allowedChatIds: Iterable<ChatId>,
  knownChatIds: Iterable<ChatId>,
  envName: string,
): Record<string, string> {
  const ids = new Set<string>();
  for (const id of allowedChatIds) ids.add(String(id));
  for (const id of knownChatIds) ids.add(String(id));
  return ids.size ? { [envName]: [...ids].join(',') } : {};
}

export type SessionMessageRef = Pick<
  SessionRuntime,
  'key' | 'workdir' | 'agent' | 'sessionId' | 'workspacePath' | 'threadId' | 'codexCumulative' | 'modelId'
>;
