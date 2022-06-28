import type { ReactNode } from 'react';
import { cn } from '../../utils';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-5">{children}</div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded-md', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3 w-3 animate-spin', className)}
      viewBox="0 0 16 16"
