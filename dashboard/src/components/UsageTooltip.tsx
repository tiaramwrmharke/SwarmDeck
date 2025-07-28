import type { UsageResult } from '../types';
import { formatCapturedAt, resetDisplay, usageMetaLine, usageWindowTone } from '../usage';
import { USAGE_TONE_COLOR } from './UsageRing';

export function UsageTooltipContent({ usage, t, title }: {
  usage: UsageResult | null;
  t: (key: string) => string;
  title?: string;
}) {
  if (!usage?.ok || !usage.windows.length) {
    return <>{usage?.error || t('config.balanceUnavailable')}</>;
  }
  const capturedAt = usage.capturedAt ? formatCapturedAt(usage.capturedAt) : null;
