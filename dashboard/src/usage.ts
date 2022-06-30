import type { UsageResult, UsageWindowInfo } from './types';

export type UsageTone = 'ok' | 'warn' | 'err';

const STATUS_TONE: Record<string, UsageTone> = {
  limit_reached: 'err',
  warning: 'warn',
};

export function usageWindowTone(window: UsageWindowInfo): UsageTone {
  const fromStatus = window.status ? STATUS_TONE[window.status] : undefined;
  if (fromStatus) return fromStatus;
  if (window.usedPercent != null) {
    if (window.usedPercent >= 100) return 'err';
    if (window.usedPercent >= 80) return 'warn';
  }
  return 'ok';
}

export function usageTone(usage: UsageResult | null): UsageTone {
  if (!usage?.ok) return 'ok';
  let tone: UsageTone = (usage.status && STATUS_TONE[usage.status]) || 'ok';
  for (const window of usage.windows) {
    const windowTone = usageWindowTone(window);
    if (windowTone === 'err') return 'err';
    if (windowTone === 'warn') tone = 'warn';
  }
  return tone;
}

export function displayableUsageWindows(usage: UsageResult | null): UsageWindowInfo[] {
  if (!usage?.ok) return [];
  return usage.windows.filter(window => window.usedPercent != null);
}

export function worstUsageWindow(usage: UsageResult | null): UsageWindowInfo | null {
  let worst: UsageWindowInfo | null = null;
