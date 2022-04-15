import fs from 'node:fs';
import type {
  StreamPreviewMeta,
  StreamPreviewPlan,
  StreamPreviewPlanStep,
  StreamSubAgent,
  StreamToolCall,
  UsageResult,
  UsageWindowInfo,
  Agent,
  SessionInfo,
} from './types.js';
import { writeScopedLog, type LogLevel } from '../core/logging.js';

export const Q = (a: string) => {
  if (/[^a-zA-Z0-9_./:=@-]/.test(a)) {
    return process.platform === 'win32'
      ? `"${a.replace(/"/g, '""')}"`
      : `'${a.replace(/'/g, "'\\''")}'`;
  }
  return a;
};

export function agentLog(msg: string, level: LogLevel = 'debug') {
  writeScopedLog('agent', msg, { level });
}

export function agentWarn(msg: string) {
  agentLog(msg, 'warn');
}

export function agentError(msg: string) {
  agentLog(msg, 'error');
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const item = String(value || '').trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    deduped.push(item);
  }
  return deduped;
}

export function numberOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export function normalizeStreamPreviewPlan(value: unknown): StreamPreviewPlan | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const rawSteps = Array.isArray(record.steps)
    ? record.steps
    : Array.isArray(record.plan)
      ? record.plan
      : [];
  const steps = rawSteps
    .map((entry): StreamPreviewPlanStep | null => {
      if (!entry || typeof entry !== 'object') return null;
      const step = typeof (entry as any).step === 'string' ? (entry as any).step.trim() : '';
      if (!step) return null;
      const rawStatus = typeof (entry as any).status === 'string' ? (entry as any).status : 'pending';
      const status = rawStatus === 'completed' || rawStatus === 'inProgress' || rawStatus === 'pending'
        ? rawStatus
        : 'pending';
      return { step, status };
    })
    .filter((entry): entry is StreamPreviewPlanStep => !!entry);
  if (!steps.length) return null;
  return {
    explanation: typeof record.explanation === 'string' && record.explanation.trim() ? record.explanation.trim() : null,
    steps,
  };
}

export function parseTodoWriteAsPlan(input: any): StreamPreviewPlan | null {
  if (!input || typeof input !== 'object') return null;
  const rawTodos = Array.isArray(input.todos) ? input.todos : [];
  if (!rawTodos.length) return null;
  const steps: StreamPreviewPlanStep[] = [];
  for (const todo of rawTodos) {
    if (!todo || typeof todo !== 'object') continue;
    const content = typeof todo.content === 'string' ? todo.content.trim() : '';
    if (!content) continue;
    const rawStatus = typeof todo.status === 'string' ? todo.status : 'pending';
    const status = rawStatus === 'completed' ? 'completed'
      : rawStatus === 'in_progress' ? 'inProgress'
        : 'pending';
    steps.push({ step: content, status });
  }
  if (!steps.length) return null;
  return { explanation: null, steps };
}

// Apply a TaskUpdate to a TodoWrite-produced plan positionally (taskId = 1-based item index).
// Used when the id isn't in the TaskCreate store, so an update issued AFTER a TodoWrite still
// lands on the displayed list — the plan card always reflects the state after the LAST change,
// whichever mechanism wrote it. Returns a fresh plan (never mutates) or null when inapplicable.
export function applyClaudeTaskUpdateToPlan(
  plan: StreamPreviewPlan | null | undefined,
  taskId: string,
  rawStatus: string,
): StreamPreviewPlan | null {
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return null;
  if (!/^\d+$/.test(taskId)) return null;
  const idx = Number(taskId) - 1;
  if (idx < 0 || idx >= plan.steps.length) return null;
  if (rawStatus === 'deleted') {
    const steps = plan.steps.filter((_, i) => i !== idx);
    return steps.length ? { explanation: plan.explanation ?? null, steps } : null;
  }
  const status: StreamPreviewPlanStep['status'] | null = rawStatus === 'completed' ? 'completed'
    : rawStatus === 'in_progress' || rawStatus === 'inprogress' ? 'inProgress'
      : rawStatus === 'pending' ? 'pending' : null;
  if (!status) return null;
  const steps = plan.steps.map((step, i) => i === idx ? { ...step, status } : step);
  return { explanation: plan.explanation ?? null, steps };
}

export function normalizeActivityLine(text: string): string { return text.replace(/\s+/g, ' ').trim(); }

export function pushRecentActivity(lines: string[], line: string, maxLines = 80) {
  const cleaned = normalizeActivityLine(line);
  if (!cleaned) return;
  if (lines[lines.length - 1] === cleaned) return;
  lines.push(cleaned);
  if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
}

export function firstNonEmptyLine(text: string): string {
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function coerceToolResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}

export function shortValue(value: unknown, max = 90): string {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function normalizeErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Error) return value.message.trim();
  if (Array.isArray(value)) {
    return value.map(item => normalizeErrorMessage(item)).filter(Boolean).join('; ').trim();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = normalizeErrorMessage(record.message)
      || normalizeErrorMessage(record.error)
      || normalizeErrorMessage(record.detail)
      || normalizeErrorMessage(record.type)
      || normalizeErrorMessage(record.code)
      || normalizeErrorMessage(record.status);
    if (preferred) return preferred;
    try { return JSON.stringify(value).trim(); } catch {}
  }
