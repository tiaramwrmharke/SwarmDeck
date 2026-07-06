import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils';

const TOOLTIP_MAX_WIDTH = 340;

// Omit the DOM `content` attribute (typed `string`) so our richer ReactNode content doesn't
// clash with HTMLAttributes.
export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  content: ReactNode;
  side?: 'top' | 'bottom';
  delayMs?: number;
  onShow?: () => void;
  children: ReactNode;
}

export function Tooltip({ content, side = 'bottom', delayMs = 120, onShow, children, className, ...rest }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const hide = () => {
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setPos(null);
  };

  const scheduleShow = () => {
