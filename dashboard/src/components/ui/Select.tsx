import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
}

interface SelectMenuStyle {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function containsNode(container: HTMLElement | null, target: EventTarget | null): boolean {
  return !!(container && target instanceof Node && container.contains(target));
}

export function Select({
  value,
  options,
  onChange,
  className,
  placeholder = '—',
  disabled = false,
  readOnly = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const current = options.find(option => option.value === value);
  const isReadOnly = readOnly || options.length <= 1;
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<SelectMenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (containsNode(rootRef.current, event.target) || containsNode(menuRef.current, event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(140, Math.min(260, openUpward ? spaceAbove : spaceBelow));
      setMenuStyle({
        left: rect.left,
        top: openUpward ? Math.max(12, rect.top - maxHeight - 8) : rect.bottom + 8,
        width: rect.width,
        maxHeight,
