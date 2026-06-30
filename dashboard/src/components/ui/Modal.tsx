import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg';
const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[840px]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  wide?: boolean;
  panelStyle?: CSSProperties;
  children: ReactNode;
}

export function Modal({ open, onClose, size, wide, panelStyle, children }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const resolvedSize: ModalSize = size ?? (wide ? 'lg' : 'sm');

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-[8px] backdrop-saturate-125"
        style={{ background: 'color-mix(in oklab, var(--th-overlay) 78%, transparent)' }}
