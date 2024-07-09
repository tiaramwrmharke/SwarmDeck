import path from 'node:path';
import { getProjectSkillPaths, listSkills, stageSessionFiles, ensureManagedSession, findSwarmDeckSession, getDriverCapabilities, isPendingSessionId, type Agent, type HandoverRef } from '../agent/index.js';
import { loadUserConfig } from '../core/config/user-config.js';
import { splitEffortForAgent } from '../core/config/runtime-config.js';
import { runtime } from './runtime.js';

const KNOWN_AGENTS = new Set<Agent>(['claude', 'codex', 'gemini', 'hermes']);

function parseGoalSlash(prompt: string): { action: 'set' | 'clear' | 'pause' | 'resume' | 'status'; objective: string } | null {
  const trimmed = prompt.trim();
  const m = trimmed.match(/^\/goal(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const args = (m[1] || '').trim();
  if (!args) return { action: 'status', objective: '' };
  const lower = args.toLowerCase();
  if (lower === 'clear' || lower === 'cancel' || lower === 'stop') return { action: 'clear', objective: '' };
  if (lower === 'pause') return { action: 'pause', objective: '' };
  if (lower === 'resume') return { action: 'resume', objective: '' };
  return { action: 'set', objective: args };
}

function resolveSkillFromPrompt(workdir: string, prompt: string): { resolvedPrompt: string; skillName: string } | null {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.match(/^\/([^\s]+)(?:\s+(.*))?$/s);
  if (!match) return null;
  const name = match[1];
  const args = (match[2] || '').trim();

  const { skills } = listSkills(workdir);
  const skill = skills.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (!skill) return null;

  const extra = args ? ` Additional context: ${args}` : '';
  const workdirHint = `[Project directory: ${workdir}]\n\n`;
  const paths = getProjectSkillPaths(workdir, skill.name);
  const skillFile = paths.claudeSkillFile || paths.sharedSkillFile || paths.agentsSkillFile;
  const targetPath = skillFile || `${workdir}/.swarmdeck/skills/${skill.name}/SKILL.md`;
  const resolvedPrompt = `${workdirHint}Read the skill definition at \`${targetPath}\` and execute the instructions defined there.${extra}`;
  return { resolvedPrompt, skillName: skill.name };
}

export interface QueueSessionTaskRequest {
  workdir: string;
  agent?: Agent | string | null;
  sessionId: string;
  prompt: string;
  model?: string | null;
  profileId?: string | null;
  effort?: string | null;
  workflow?: boolean;
  attachments?: string[];
  previousAgent?: Agent | string | null;
  previousSessionId?: string | null;
}

function resolveProfileIdOverride(value: string | null | undefined): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return undefined;
}

function resolveHandoverFrom(request: QueueSessionTaskRequest, targetAgent: Agent): HandoverRef | null {
  const prevAgent = typeof request.previousAgent === 'string' ? request.previousAgent.trim() : '';
  const prevSessionId = typeof request.previousSessionId === 'string' ? request.previousSessionId.trim() : '';
  if (!prevAgent || !prevSessionId) return null;
  if (!KNOWN_AGENTS.has(prevAgent as Agent)) return null;
  if (prevAgent === targetAgent) return null;
  if (isPendingSessionId(prevSessionId)) return null;
  const record = findSwarmDeckSession(request.workdir, prevAgent as Agent, prevSessionId);
  if (!record) return null;
  return { agent: prevAgent as Agent, sessionId: prevSessionId };
}

export async function queueDashboardSessionTask(request: QueueSessionTaskRequest) {
  const bot = runtime.getBotRef();
  if (!bot) return { ok: false as const, error: 'Bot is not running' };
  if (!request.workdir || (!request.prompt && !(request.attachments || []).length)) {
    return { ok: false as const, error: 'workdir and either prompt or attachments are required' };
  }

  const config = loadUserConfig();
  const resolvedAgent = typeof request.agent === 'string' && KNOWN_AGENTS.has(request.agent as Agent)
    ? request.agent as Agent
    : runtime.getRuntimeDefaultAgent(config);
  const modelId = typeof request.model === 'string' ? request.model.trim() : '';
  const profileId = resolveProfileIdOverride(request.profileId);
  const { effort: splitEffort, workflow: ultraWorkflow } = splitEffortForAgent(
    resolvedAgent,
    typeof request.effort === 'string' ? request.effort : '',
  );
  const thinkingEffort = resolvedAgent === 'gemini' ? '' : splitEffort;
  const workflowEnabled = ultraWorkflow || request.workflow === true;

  const goalCmd = parseGoalSlash(request.prompt || '');
  if (goalCmd && request.sessionId && !isPendingSessionId(request.sessionId)) {
