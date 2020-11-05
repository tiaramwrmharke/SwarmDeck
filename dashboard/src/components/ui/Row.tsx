import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';

const ROW_GRID_VAR = '--row-grid';

const DEFAULT_GRID = '260px 120px minmax(0,1fr) auto';

const GRID_COLS_CLASS =
  'lg:grid-cols-[var(--row-grid,260px_120px_minmax(0,1fr)_auto)]';

export function RowGroup({
  children,
  className,
  columns,
}: {
  children: ReactNode;
  className?: string;
  columns?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-2)]',
        '[&>*+*]:border-t [&>*+*]:border-[var(--edge-subtle)]',
        className,
      )}
      style={{ [ROW_GRID_VAR]: columns ?? DEFAULT_GRID } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || right) && (
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            {title && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-5">
                {title}
              </div>
            )}
            {description && (
              <div className="mt-1.5 text-[13px] leading-relaxed text-fg-4">{description}</div>
            )}
