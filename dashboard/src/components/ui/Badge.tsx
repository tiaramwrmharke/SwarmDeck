import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';

export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'running' | 'accent' | 'muted';

const TONE_VARS: Record<BadgeTone, CSSProperties> = {
  ok: {
    borderColor: 'var(--th-badge-ok-border)',
    backgroundColor: 'var(--th-badge-ok-bg)',
    color: 'var(--th-badge-ok-text)',
  },
  warn: {
    borderColor: 'var(--th-badge-warn-border)',
    backgroundColor: 'var(--th-badge-warn-bg)',
    color: 'var(--th-badge-warn-text)',
  },
  err: {
    borderColor: 'var(--th-badge-err-border)',
    backgroundColor: 'var(--th-badge-err-bg)',
    color: 'var(--th-badge-err-text)',
  },
