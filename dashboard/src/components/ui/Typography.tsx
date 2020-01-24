import { forwardRef, type HTMLAttributes, type ReactNode, createElement } from 'react';
import { cn } from '../../utils';

const HEADING_VARIANTS = {
  1: { tag: 'h1' as const, cls: 'text-[26px] leading-[34px] font-semibold tracking-tight text-fg' },
  2: { tag: 'h2' as const, cls: 'text-[18px] leading-[26px] font-semibold tracking-tight text-fg' },
  3: { tag: 'h3' as const, cls: 'text-[15px] leading-[22px] font-semibold text-fg' },
  4: { tag: 'h4' as const, cls: 'text-[13px] leading-[20px] font-semibold text-fg-2' },
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4;
  children: ReactNode;
}

