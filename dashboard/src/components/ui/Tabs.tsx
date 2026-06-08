import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils';

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex items-center rounded-lg border border-edge bg-panel p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]', className)}>
      {children}
    </div>
  );
}
