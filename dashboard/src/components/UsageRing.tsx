import type { UsageTone } from '../usage';

export const USAGE_TONE_COLOR: Record<UsageTone, string> = {
  err: 'var(--th-badge-err-text)',
  warn: 'var(--th-badge-warn-text)',
  ok: 'var(--th-fg-5)',
};

export function UsageRing({ percent, tone, trackTone, alert = false, size = 14 }: {
  percent: number;
  tone: UsageTone;
  trackTone?: UsageTone;
  alert?: boolean;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const color = USAGE_TONE_COLOR[tone];
  const trackColor = USAGE_TONE_COLOR[trackTone ?? tone];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`${Math.round(clamped)}%`}>
