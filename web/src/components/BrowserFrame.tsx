import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export default function BrowserFrame({
  src,
  video,
  alt,
  ratioW,
  ratioH,
  cropTop = 0,
  label = 'localhost:3939',
  badge,
  className,
}: {
  src?: string;
  video?: string;
  alt: string;
  ratioW: number;
  ratioH: number;
  cropTop?: number;
  label?: string;
  badge?: string;
  className?: string;
}) {
  const visibleRatio = ratioW / (ratioH * (1 - cropTop));
  return (
    <figure className={cn('overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12] shadow-2xl', className)}>
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
