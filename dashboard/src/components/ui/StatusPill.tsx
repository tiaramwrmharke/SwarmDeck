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
