import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Badge, Spinner } from './ui';
import type { DirEntry } from '../types';

export interface DirBrowserProps {
  initialPath?: string;
  maxHeight?: number;
  minHeight?: number;
  onSelect?: (path: string, isGit: boolean) => void;
  compact?: boolean;
  t: (key: string) => string;
}

export interface DirBrowserHandle {
  currentPath: string;
  isGit: boolean;
  browse: (dir?: string) => Promise<void>;
}

export function DirBrowser({
  initialPath,
  maxHeight = 420,
  minHeight = 200,
  onSelect,
  compact,
  t,
}: DirBrowserProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [inputPath, setInputPath] = useState('');
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [parentDir, setParentDir] = useState('');
  const [isGit, setIsGit] = useState(false);
