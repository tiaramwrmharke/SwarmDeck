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
