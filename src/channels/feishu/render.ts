import type { Agent, StreamResult } from '../../bot/bot.js';
import type { HumanLoopPromptState, ResolvedHumanLoopAnswers } from '../../bot/human-loop.js';
import type {
  CommandActionButton,
  CommandItemState,
  CommandNotice,
  CommandSelectionItem,
  CommandSelectionView,
} from '../../bot/command-ui.js';
import { encodeCommandAction } from '../../bot/command-ui.js';
import { fmtUptime, fmtTokens, fmtBytes, formatGitStatusLine } from '../../bot/bot.js';
import type { StartData, SessionsPageData, AgentsListData, ModelsListData, SkillsListData, StatusData, HostData, WorkspacesData } from '../../bot/commands.js';
import { summarizePromptForStatus } from '../../bot/commands.js';
import type { LivePreviewRenderer } from '../telegram/live-preview.js';
import type { StreamPreviewRenderInput, FooterDecorations } from '../../bot/render-shared.js';
import {
  footerStatusSymbol,
  formatFooterParts,
  trimActivityForPreview,
  buildUsageOverviewLines,
  extractFinalReplyData,
  extractStreamPreviewData,
} from '../../bot/render-shared.js';
export { dispatchImageBlocks } from '../../bot/render-shared.js';
import {
  currentHumanLoopQuestion,
  humanLoopAnsweredCount,
  isHumanLoopAwaitingText,
  isHumanLoopQuestionAnswered,
  summarizeHumanLoopAnswer,
} from '../../bot/human-loop.js';
import type { FeishuCardActionItem, FeishuCardActionRow, FeishuCardView } from './channel.js';
import path from 'node:path';
import { listSubdirs } from '../../bot/bot.js';

function formatPreviewFooter(
  agent: Agent,
  elapsedMs: number,
  meta?: import('../../bot/bot.js').StreamPreviewMeta | null,
  decorations?: FooterDecorations,
): string {
  const parts = formatFooterParts(agent, elapsedMs, meta, null, decorations);
  return `${footerStatusSymbol('running')} ${parts.identity}\n*${parts.runtime}*`;
}

function formatFinalFooter(
  status: import('../../bot/render-shared.js').FooterStatus,
  agent: Agent,
  elapsedMs: number,
  contextPercent?: number | null,
  decorations?: FooterDecorations,
): string {
  const parts = formatFooterParts(agent, elapsedMs, null, contextPercent ?? null, decorations);
  return `${footerStatusSymbol(status)} ${parts.identity}\n*${parts.runtime}*`;
}

function truncateLabel(label: string, maxChars = 24): string {
  return label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label;
}

function cardButton(label: string, action: string, primary = false): FeishuCardActionItem {
  const button: any = {
    tag: 'button',
    text: { tag: 'plain_text', content: truncateLabel(label) },
    value: { action },
  };
  if (primary) button.type = 'primary';
  return button;
}

function cardRows(actions: FeishuCardActionItem[], size = 3): FeishuCardActionRow[] {
  const rows: FeishuCardActionRow[] = [];
  for (let i = 0; i < actions.length; i += size) {
    const rowActions = actions.slice(i, i + size);
    if (!rowActions.length) continue;
    rows.push({ actions: rowActions });
  }
  return rows;
}

function selectionStateSymbol(state: CommandItemState | undefined): string {
  switch (state) {
    case 'current': return '●';
    case 'running': return '🟢';
    case 'unavailable': return '❌';
    default: return '○';
  }
}

function formatCommandItemMarkdown(item: CommandSelectionItem, index: number): string {
  const parts = [
    selectionStateSymbol(item.state),
    `**${index + 1}.**`,
    item.label,
  ];
  if (item.detail) parts.push(item.detail);
  return parts.join(' ');
}

function formatCommandButtonLabel(button: CommandActionButton): string {
  const prefix = button.state && button.state !== 'default'
    ? `${selectionStateSymbol(button.state)} `
    : '';
  return truncateLabel(`${prefix}${button.label}`.trim());
}

function actionButton(button: CommandActionButton): FeishuCardActionItem {
  return cardButton(formatCommandButtonLabel(button), encodeCommandAction(button.action), !!button.primary);
}

export function renderCommandNotice(notice: CommandNotice): string {
  const lines = [`**${notice.title}**`];
  if (notice.value) {
    lines.push(notice.valueMode === 'plain' ? notice.value : `\`${notice.value}\``);
  }
  if (notice.detail) lines.push(notice.detail);
  return lines.join('\n\n');
}

export function renderCommandSelectionMarkdown(view: CommandSelectionView): string {
  const title = view.detail ? `**${view.title}** · \`${view.detail}\`` : `**${view.title}**`;
  const lines = [title];
  if (view.metaLines.length) lines.push(...view.metaLines.map(line => `*${line}*`));

  if (view.items.length) {
    lines.push('', ...view.items.map((item, index) => formatCommandItemMarkdown(item, index)));
  } else if (view.emptyText) {
    lines.push('', `*${view.emptyText}*`);
  }

  if (view.helperText) lines.push('', `*${view.helperText}*`);
  return lines.join('\n');
}

export function renderCommandSelectionCard(view: CommandSelectionView): FeishuCardView {
  return {
    markdown: renderCommandSelectionMarkdown(view),
    rows: view.rows.map(row => ({ actions: row.map(actionButton) })),
  };
}

function stripCodeFences(text: string): string {
  return text.replace(/^(`{3,}|~{3,}).*$/gm, '');
}

function ensureBalancedCodeFences(text: string): string {
  let inCode = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCode = !inCode;
    }
  }
  return inCode ? text + '\n```' : text;
