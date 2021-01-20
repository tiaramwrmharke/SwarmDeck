import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils';

export interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  mono?: boolean;
  orientation?: 'vertical' | 'inline';
  className?: string;
}

export function Field({
  label,
  children,
  mono,
  orientation = 'vertical',
  className,
}: FieldProps) {
  if (orientation === 'inline') {
    return (
      <div className={cn('flex items-baseline gap-2 min-w-0', className)}>
        {label && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-5">
            {label}
          </span>
        )}
        <span className={cn('truncate text-[13px] text-fg-2', mono && 'font-mono text-[12px] text-fg-3')}>
          {children}
        </span>
      </div>
    );
  }
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-5">
          {label}
        </div>
      )}
