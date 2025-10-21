import type { StreamPreviewMeta, StreamPreviewPlan } from '../agent/index.js';

export interface ActivitySummary {
  narrative: string[];
  failedCommands: number;
  completedCommands: number;
  activeCommands: number;
}

function compactActivityPath(token: string): string {
  if (!token.includes('/')) return token;
  const segments = token.split('/').filter(Boolean);
  if (segments.length < 4) return token;
  const tail = segments.slice(-2).join('/');
  return `…/${tail}`;
}

function compactPathsInActivityLine(line: string): string {
  return line.replace(/(^|\s)([~/][^\s]+)/g, (_match, lead: string, raw: string) => {
    const trailingPunct = raw.match(/[)\],.;!?]+$/)?.[0] ?? '';
    const path = trailingPunct ? raw.slice(0, -trailingPunct.length) : raw;
    return `${lead}${compactActivityPath(path)}${trailingPunct}`;
  });
}

const TOOL_DONE_RE = /^(.+?)\s+(done|failed)$/;
const TOOL_ARROW_RE = /^(.+?)\s*->\s*(.+)$/;

const INJECTED_PROMPT_MARKERS = [
  '\n[Session Workspace]',
  '\n[Telegram Artifact Return]',
  '\n[Artifact Return]',
];

export function stripInjectedPrompts(text: string): string {
  for (const marker of INJECTED_PROMPT_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx >= 0) return text.slice(0, idx).trim();
  }
  return text.trim();
}

export function summarizePromptForStatus(prompt: string, maxLen = 50): string {
  const clean = stripInjectedPrompts(prompt).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, Math.max(0, maxLen - 3)).trimEnd() + '...';
}

function parseClaudeShellActivity(line: string): {
  key: string;
  status: 'active' | 'done' | 'failed';
} | null {
  const prefix = 'Run shell: ';
  if (!line.startsWith(prefix)) return null;

  const detail = line.slice(prefix.length).trim();
  if (!detail) return { key: prefix.trim(), status: 'active' };

  const doneIdx = detail.indexOf(' -> ');
  if (doneIdx > 0) {
    return {
      key: detail.slice(0, doneIdx).trim(),
      status: 'done',
    };
  }

  const failed = detail.match(/^(.*)\sfailed(?::.*)?$/);
  if (failed?.[1]?.trim()) {
    return {
      key: failed[1].trim(),
      status: 'failed',
    };
  }

  if (detail.endsWith(' done')) {
    const key = detail.slice(0, -' done'.length).trim();
    return { key: key || detail, status: 'done' };
  }

  return { key: detail, status: 'active' };
}

export function parseActivitySummary(activity: string): ActivitySummary {
  const narrative: string[] = [];
