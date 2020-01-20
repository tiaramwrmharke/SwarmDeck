import type { UsageTone } from '../usage';

export const USAGE_TONE_COLOR: Record<UsageTone, string> = {
  err: 'var(--th-badge-err-text)',
  warn: 'var(--th-badge-warn-text)',
  ok: 'var(--th-fg-5)',
};

export function UsageRing({ percent, tone, trackTone, alert = false, size = 14 }: {
