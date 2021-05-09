import { hasPendingChannelValidation } from './channel-status';
import type { AppState } from './types';

type Translate = (key: string) => string;

const APP_STARTUP_LOADING_WINDOW_MS = 15_000;

export function resolveAppStatusBadge(state: AppState | null, t: Translate): {
  badgeVariant: 'ok' | 'warn' | 'accent' | 'muted';
  badgeContent: string;
  dotVariant: 'ok' | 'warn' | 'idle';
  dotPulse: boolean;
} {
  if (!state) {
    return {
      badgeVariant: 'muted',
      badgeContent: t('status.loading'),
      dotVariant: 'warn',
      dotPulse: true,
    };
