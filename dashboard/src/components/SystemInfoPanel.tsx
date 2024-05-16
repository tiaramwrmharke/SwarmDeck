import { cn, fmtBytes } from '../utils';
import type { HostInfo } from '../types';
import { Skeleton } from './ui';
import { SectionCard } from '../pages/shared';

type MetricTone = 'ok' | 'warn' | 'err' | 'muted';

export interface SystemMetricItem {
  key: string;
  label: string;
  value: string;
  detail?: string | string[];
  tone?: MetricTone;
  mono?: boolean;
  progressPercent?: number | null;
}

function toneClassName(tone: MetricTone | undefined): string {
  switch (tone) {
    case 'ok':
      return 'text-emerald-200';
    case 'warn':
      return 'text-amber-200';
    case 'err':
      return 'text-red-200';
    default:
      return 'text-fg-2';
  }
}

function progressClassName(percent: number): string {
  if (percent >= 85) return 'bg-red-500 shadow-[0_0_8px_var(--th-err-glow)]';
  if (percent >= 65) return 'bg-amber-500 shadow-[0_0_8px_var(--th-warn-glow)]';
  return 'bg-primary shadow-[0_0_8px_var(--th-glow-a)]';
}

function safePercent(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function formatLoad(value: number | null | undefined): string | null {
  if (!Number.isFinite(value ?? NaN)) return null;
