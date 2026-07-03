import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function InView({
  children,
  rootMargin = '250px',
  className,
  fallback = null,
  keepMounted = true,
}: {
  children: ReactNode;
  rootMargin?: string;
  className?: string;
  fallback?: ReactNode;
  keepMounted?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
