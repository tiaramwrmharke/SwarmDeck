import type { ReactNode } from 'react';
import { cn } from '../../utils';

export function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={cn('shrink-0 text-fg-5/40 transition-transform duration-200', open && 'rotate-180', className)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function CollapsibleCard({
  open,
  onToggle,
  dot,
  label,
  preview,
  badge,
  collapsedContent,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  dot?: { color: string; pulse?: boolean };
  label: string;
  preview?: ReactNode;
  badge?: ReactNode;
  collapsedContent?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
