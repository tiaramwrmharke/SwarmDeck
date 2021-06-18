import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';
import { tv, type VariantProps } from './variants';

const button = tv({
  base: [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background,color,border-color,box-shadow,transform]',
    'focus-visible:outline-none',
    'focus-visible:shadow-[0_0_0_3px_var(--brand-glow-a)]',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  variants: {
    tone: {
      primary: [
        'border border-transparent',
        'bg-[var(--brand-accent)] text-[var(--brand-accent-fg)]',
        'hover:opacity-90',
      ].join(' '),
      secondary: [
