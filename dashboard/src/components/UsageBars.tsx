import { Fragment } from 'react';
import type { UsageResult } from '../types';
import { createT } from '../i18n';
import { useStore } from '../store';
import { resetDisplay, usageMetaLine, usageWindowTone } from '../usage';
import { USAGE_TONE_COLOR } from './UsageRing';

// Compact per-account usage: every resource window (5h / 7d / …) as a labelled bar + reset
// countdown. A fixed 4-column grid (label · bar · % · reset) keeps every row — and every
// instance — aligned. Shared by the agent-config account cards and the header switcher.
export function UsageBars({ usage, emptyText, className = '' }: {
  usage: UsageResult | null;
  emptyText: string;
  className?: string;
}) {
  const t = createT(useStore(s => s.locale));
  const windows = usage?.ok ? usage.windows : [];
  if (!windows.length) {
    return <div className={`text-[11px] leading-relaxed text-fg-5 ${className}`}>{usage?.error || emptyText}</div>;
  }
  return (
    <div className={`grid grid-cols-[3.5rem_minmax(0,1fr)_2.25rem_3.25rem] items-center gap-x-1.5 gap-y-1 text-[11px] ${className}`}>
      {windows.map(w => {
        const tone = usageWindowTone(w);
        const pct = w.usedPercent;
