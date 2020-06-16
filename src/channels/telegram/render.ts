import type { Agent, StreamPreviewMeta, StreamResult } from '../../bot/bot.js';
import type { SkillsListData, UsageOverview } from '../../bot/commands.js';
import type { HumanLoopPromptState, ResolvedHumanLoopAnswers } from '../../bot/human-loop.js';
import type {
  CommandActionButton,
  CommandItemState,
  CommandNotice,
  CommandSelectionItem,
  CommandSelectionView,
} from '../../bot/command-ui.js';
import { encodeCommandAction } from '../../bot/command-ui.js';
import {
  currentHumanLoopQuestion,
  humanLoopAnsweredCount,
  isHumanLoopAwaitingText,
  isHumanLoopQuestionAnswered,
  summarizeHumanLoopAnswer,
} from '../../bot/human-loop.js';
import type { FooterStatus, StreamPreviewRenderInput, FooterDecorations } from '../../bot/render-shared.js';
import {
  footerStatusSymbol,
  formatFooterParts,
  trimActivityForPreview,
  buildUsageOverviewLines,
  extractFinalReplyData,
  extractStreamPreviewData,
  parseGfmTable,
} from '../../bot/render-shared.js';
export type { FooterStatus, StreamPreviewRenderInput } from '../../bot/render-shared.js';
export { dispatchImageBlocks } from '../../bot/render-shared.js';

export interface FinalReplyRender {
  fullHtml: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
}

export function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncateMiddle(text: string, maxChars = 36): string {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  const visible = maxChars - 3;
  const head = Math.ceil(visible / 2);
  const tail = Math.floor(visible / 2);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function compactCode(text: string, maxChars = 36): string {
  return `<code>${escapeHtml(truncateMiddle(text, maxChars))}</code>`;
}

export function buildCompactSelectionTitle(title: string, detail?: string | null): string {
  const cleanDetail = String(detail || '').trim();
  if (!cleanDetail) return `<b>${escapeHtml(title)}</b>`;
  return `<b>${escapeHtml(title)}</b> · ${compactCode(cleanDetail, 20)}`;
}

export function buildCompactSelectionNotice(
  title: string,
  value: string,
  detail?: string | null,
  codeMaxChars = 40,
): string {
  const lines = [`<b>${escapeHtml(title)}</b>`, compactCode(value, codeMaxChars)];
  const cleanDetail = String(detail || '').trim();
  if (cleanDetail) lines.push(`<i>${escapeHtml(cleanDetail)}</i>`);
  return lines.join('\n');
}

function selectionStateSymbol(state: CommandItemState | undefined): string {
  switch (state) {
    case 'current': return '●';
    case 'running': return '◐';
    case 'unavailable': return '✕';
    default: return '○';
  }
}

function formatCommandItemHtml(item: CommandSelectionItem, index: number): string {
  const parts = [
    selectionStateSymbol(item.state),
    `<b>${index + 1}.</b>`,
    escapeHtml(item.label),
  ];
  if (item.detail) parts.push(escapeHtml(item.detail));
  return parts.join(' ');
}

function formatCommandButtonLabel(button: CommandActionButton, maxChars = 24): string {
  const prefix = button.state && button.state !== 'default'
    ? `${selectionStateSymbol(button.state)} `
    : '';
  return truncateMiddle(`${prefix}${button.label}`.trim(), maxChars);
