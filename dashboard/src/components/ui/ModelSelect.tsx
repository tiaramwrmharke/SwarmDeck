import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils';

interface ModelOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  group?: string;
}

interface MenuStyle {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function containsNode(container: HTMLElement | null, target: EventTarget | null): boolean {
  return !!(container && target instanceof Node && container.contains(target));
}

function matchesQuery(option: ModelOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${option.label} ${option.description || ''} ${option.meta || ''}`.toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

export function ModelSelect({
  value,
  options,
  onChange,
  className,
  placeholder = '—',
  disabled = false,
  searchPlaceholder = 'Search models...',
  noMatchesText = 'No matches',
  currentLabel = 'Current',
}: {
  value: string;
  options: ModelOption[];
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  noMatchesText?: string;
  currentLabel?: string;
}) {
  const current = options.find(option => option.value === value);
  const isReadOnly = options.length <= 1;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      const handle = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
