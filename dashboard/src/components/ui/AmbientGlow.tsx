import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils';

export interface AmbientGlowProps extends HTMLAttributes<HTMLDivElement> {
  streaming?: boolean;
  children: ReactNode;
}
