import type { Agent } from './types';
import type { SessionInfo } from './types';

export const AGENT_ACCEPTED_PROVIDER_KINDS: Record<Agent, readonly string[]> = {
  claude: ['anthropic', 'openai-compatible'],
  codex: ['openai', 'openai-compatible'],
  gemini: ['google'],
  hermes: ['anthropic', 'openai', 'openai-compatible', 'google'],
};

export function fmtBytes(b: number): string {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(0) + 'KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + 'MB';
  if (b < 1099511627776) return (b / 1073741824).toFixed(1) + 'GB';
  return (b / 1099511627776).toFixed(1) + 'TB';
}

export function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h ' + (m % 60) + 'm' : Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return '<1m';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d + 'd';
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface AgentMeta {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  letter: string;
  glow: string;
  border: string;
  advantageKey: string;
}

const defaultMeta: AgentMeta = {
  label: '?',
  shortLabel: '?',
  color: '#94a3b8',
  bg: 'rgba(148,163,184,0.1)',
  letter: '?',
  glow: 'rgba(148,163,184,0.16)',
  border: 'rgba(148,163,184,0.18)',
  advantageKey: '',
};

export const agentMeta: Record<string, AgentMeta> = {
  claude: {
    label: 'Claude Code',
    shortLabel: 'Claude',
    color: '#b4c6ff',
    bg: 'rgba(180,198,255,0.12)',
    letter: 'C',
    glow: 'rgba(180,198,255,0.2)',
    border: 'rgba(180,198,255,0.2)',
    advantageKey: 'config.agentAdvantageClaude',
  },
  codex: {
    label: 'Codex',
    shortLabel: 'Codex',
    color: '#7dd3fc',
    bg: 'rgba(125,211,252,0.12)',
    letter: 'O',
    glow: 'rgba(125,211,252,0.2)',
    border: 'rgba(125,211,252,0.2)',
    advantageKey: 'config.agentAdvantageCodex',
  },
  gemini: {
    label: 'Gemini CLI',
    shortLabel: 'Gemini',
    color: '#c4b5fd',
    bg: 'rgba(196,181,253,0.12)',
