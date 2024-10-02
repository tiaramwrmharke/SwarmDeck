import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';
import { Dot, type DotTone } from './Badge';

export type StatusState = 'running' | 'ok' | 'warn' | 'err' | 'info' | 'idle';

const STATE_TO_DOT: Record<StatusState, DotTone> = {
  running: 'running',
  ok: 'ok',
  warn: 'warn',
  err: 'err',
  info: 'info',
  idle: 'idle',
};

const STATE_TO_TEXT: Record<StatusState, string> = {
  running: 'text-[var(--th-badge-running-text)]',
  ok: 'text-[var(--th-badge-ok-text)]',
  warn: 'text-[var(--th-badge-warn-text)]',
  err: 'text-[var(--th-badge-err-text)]',
  info: 'text-[var(--th-badge-info-text)]',
  idle: 'text-fg-4',
};

const STATE_TO_BG: Record<StatusState, string> = {
  running: 'bg-[var(--th-badge-running-bg)] border-[var(--th-badge-running-border)]',
  ok: 'bg-[var(--th-badge-ok-bg)] border-[var(--th-badge-ok-border)]',
  warn: 'bg-[var(--th-badge-warn-bg)] border-[var(--th-badge-warn-border)]',
  err: 'bg-[var(--th-badge-err-bg)] border-[var(--th-badge-err-border)]',
  info: 'bg-[var(--th-badge-info-bg)] border-[var(--th-badge-info-border)]',
  idle: 'bg-transparent border-[var(--edge-subtle)]',
};
