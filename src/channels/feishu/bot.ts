import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  Bot, normalizeAgent, type Agent, type SessionRuntime, type StreamResult,
  type ImTaskPresenter, type ImTaskPresenterOpts,
  fmtTokens, buildPrompt,
  parseAllowedChatIds,
} from '../../bot/bot.js';
import {
  BOT_SHUTDOWN_FORCE_EXIT_MS,
  SessionMessageRegistry,
  buildBotMenuState,
  buildKnownChatEnv,
  buildSessionTaskId,
} from '../../bot/orchestration.js';
import {
  stageSessionFiles,
} from '../../agent/index.js';
import type { McpSendFileCallback } from '../../agent/mcp/bridge.js';
import { shutdownAllDrivers } from '../../agent/driver.js';
import { expandTilde } from '../../core/platform.js';
import {
  SKILL_CMD_PREFIX,
} from '../../bot/menu.js';
import {
  getStartData,
  getSessionsPageData,
  getModelsListData,
  getSessionTurnPreviewData,
  getStatusDataAsync,
  getHostDataSync,
  getWorkspacesData,
  resolveSkillPrompt,
  handleGoalCommand,
  getSessionsDigestData,
  formatSessionsDigestText,
} from '../../bot/commands.js';
import {
  buildAgentsCommandView,
  buildModelsCommandView,
  buildModeCommandView,
  buildSessionsCommandView,
  buildSkillsCommandView,
  decodeCommandAction,
  executeCommandAction,
  type CommandActionResult,
  type CommandSelectionView,
} from '../../bot/command-ui.js';
import { LivePreview } from '../telegram/live-preview.js';
import {
  registerProcessRuntime,
  requestProcessRestart,
} from '../../core/process-control.js';
import {
  feishuPreviewRenderer,
  buildInitialPreviewMarkdown,
  buildHumanLoopPromptMarkdown,
  buildAnsweredHumanLoopPromptMarkdown,
  buildFinalReplyRender,
  dispatchImageBlocks,
  renderCommandNotice,
  renderCommandSelectionCard,
  renderSessionTurnMarkdown,
  renderStart,
  renderStatus,
  renderHost,
  buildSwitchWorkdirCard,
  buildWorkspacesCard,
  resolveFeishuRegisteredPath,
} from './render.js';
import { currentHumanLoopQuestion, humanLoopOptionSelected, type HumanLoopPromptState, type ResolvedHumanLoopAnswers } from '../../bot/human-loop.js';
import { FeishuChannel, type FeishuContext, type FeishuCallbackContext, type FeishuMessage } from './channel.js';
import { splitText, supportsChannelCapability } from '../base.js';
import { getActiveUserConfig, loadKnownChatIds } from '../../core/config/user-config.js';
import { VERSION } from '../../core/version.js';
import { FEISHU_BOT_CARD_MAX } from '../../core/constants.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const SHUTDOWN_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};
const FEISHU_FILE_STAGE_REACTION = 'Get';

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err ?? 'unknown error');

  const parts = [`${err.name}: ${err.message}`];
  for (const key of ['code', 'errno', 'syscall', 'address', 'port', 'host', 'hostname', 'path']) {
    const value = (err as any)?.[key];
    if (value != null && value !== '') parts.push(`${key}=${value}`);
  }

  const cause = (err as any)?.cause;
  if (cause && cause !== err) parts.push(`cause=${describeError(cause)}`);
  return parts.join(' | ');
}

function buildInteractionEchoMarkdown(summary: ResolvedHumanLoopAnswers): string | null {
  if (summary.status === 'cancelled') return '*⊘ Prompt cancelled.*';
  if (!summary.rows.length) return null;
  if (summary.rows.length === 1) {
    return `**✓ Answered** · ${summary.rows[0].display}`;
  }
  const lines = ['**✓ Answered**'];
  for (const row of summary.rows) {
    lines.push(`• ${row.label}: ${row.display}`);
  }
  return lines.join('\n');
}

function formatToolLog(activity: string | null | undefined): string {
  const lines = String(activity || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => (
      /^Read\b/.test(line)
      || /^Edit\b/.test(line)
      || /^Write\b/.test(line)
      || /^List files\b/.test(line)
      || /^Search text\b/.test(line)
      || /^Fetch\b/.test(line)
      || /^Search web\b/.test(line)
      || /^Update plan\b/.test(line)
      || /^Run task\b/.test(line)
      || /^Run shell\b/.test(line)
      || /^Use\b/.test(line)
      || /^Using\b/.test(line)
      || /^Updated\b/.test(line)
      || /^Inspect image\b/.test(line)
      || /^Request user input\b/.test(line)
      || /^Run multiple tools\b/.test(line)
      || /\bdone\b/.test(line)
      || /\bfailed\b/.test(line)
    ));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    deduped.push(line);
  }

  if (!deduped.length) return '-';

  const summary = deduped.slice(0, 6).join(' | ');
  return summary.length <= 240 ? summary : `${summary.slice(0, 237).trimEnd()}...`;
}

export class FeishuBot extends Bot {
  private appId: string;
  private appSecret: string;
  private domain: string;
  private channel!: FeishuChannel;

  private sessionMessages = new SessionMessageRegistry<string, string>();
  private nextTaskId = 1;
  private shutdownInFlight = false;
  private shutdownExitCode: number | null = null;
  private shutdownForceExitTimer: ReturnType<typeof setTimeout> | null = null;
  private signalHandlers: Partial<Record<string, () => void>> = {};
  private processRuntimeCleanup: (() => void) | null = null;

  constructor() {
    super();
    const config = getActiveUserConfig();
    if (process.env.FEISHU_ALLOWED_CHAT_IDS) {
      for (const id of parseAllowedChatIds(process.env.FEISHU_ALLOWED_CHAT_IDS)) this.allowedChatIds.add(id);
    }

    this.appId = String(config.feishuAppId || process.env.FEISHU_APP_ID || '').trim();
    this.appSecret = String(config.feishuAppSecret || process.env.FEISHU_APP_SECRET || '').trim();
    this.domain = (process.env.FEISHU_DOMAIN || 'https://open.feishu.cn').trim();

    if (!this.appId || !this.appSecret) {
      throw new Error('Missing Feishu credentials. Set FEISHU_APP_ID and FEISHU_APP_SECRET');
    }
  }

  public override requestStop(): void {
    super.requestStop();
    try { this.channel?.disconnect(); } catch {}
  }

  protected override onManagedConfigChange(config: Record<string, any>, opts: { initial?: boolean } = {}) {
    const nextAppId = String(config.feishuAppId || process.env.FEISHU_APP_ID || '').trim();
    const nextAppSecret = String(config.feishuAppSecret || process.env.FEISHU_APP_SECRET || '').trim();
    if (nextAppId && nextAppId !== this.appId) {
      this.appId = nextAppId;
      if (!opts.initial) this.log('feishu appId reloaded from setting.json');
    }
    if (nextAppSecret && nextAppSecret !== this.appSecret) {
      this.appSecret = nextAppSecret;
      if (!opts.initial) this.log('feishu appSecret reloaded from setting.json');
    }
  }

  private static readonly SKILL_CMD_PREFIX = SKILL_CMD_PREFIX;

  async setupMenu() {
    if (!supportsChannelCapability(this.channel, 'commandMenu')) return;
    const { commands, skillCount } = buildBotMenuState(this);
    await this.channel.setMenu(commands);
    this.log(`menu: ${commands.length} commands (${skillCount} skills)`);
  }

  protected override afterSwitchWorkdir(_oldPath: string, _newPath: string) {
    if (!this.channel) return;
    void this.setupMenu().catch(err => this.log(`menu refresh failed: ${err}`));
  }

  private installSignalHandlers() {
    this.removeSignalHandlers();
    const onSigint = () => this.beginShutdown('SIGINT');
    const onSigterm = () => this.beginShutdown('SIGTERM');
