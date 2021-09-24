import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';
import { tv, type VariantProps } from './variants';

const input = tv({
  base: [
    'flex w-full text-fg outline-none',
    'border rounded-md',
    'transition-[border-color,box-shadow,background]',
    'placeholder:text-fg-5',
    'focus:shadow-[0_0_0_3px_var(--brand-glow-a)]',
    'disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:border-[var(--edge-subtle)] disabled:text-fg-5',
    'disabled:shadow-none disabled:hover:border-[var(--edge-subtle)] disabled:placeholder:text-fg-6',
  ].join(' '),
  variants: {
    size: {
      sm: 'h-7 px-2 py-1 text-[12px]',
      md: 'h-9 px-3 py-1.5 text-[13px]',
      lg: 'h-10 px-3 py-2 text-[14px]',
    },
