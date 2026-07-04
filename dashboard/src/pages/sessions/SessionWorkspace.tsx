import { Suspense, lazy, startTransition, useDeferredValue, useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useStore } from '../../store';
import { createT } from '../../i18n';
import { api } from '../../api';
import { loadWorkspaceSessions, prefetchSessionMessages } from '../../session-preload';
import { useDashboardEvent, useDashboardReconnect } from '../../ws';
import {
  applyLiveSessionState,
  cn,
  fmtTime,
  fmtRelative,
  getAgentMeta,
  isPendingSessionId,
  normalizeLiveSessionState,
  resolveCanonicalSessionId,
  shortenModel,
  sessionDisplayState,
  sessionListContextText,
  sessionListDisplayText,
  type LiveSessionState,
} from '../../utils';
import { Dot, Spinner, Modal, ModalHeader, Button, IconPicker, Tooltip } from '../../components/ui';
import { BrandIcon } from '../../components/BrandIcon';
import { DirBrowser } from '../../components/DirBrowser';
import type { SessionInfo, WorkspaceEntry, DirEntry, OpenTarget, GitStatus } from '../../types';
import { InputComposer } from './InputComposer';
import { UserBubble } from './TurnView';
import { ThinkingDots } from './LivePreview';
import { WorkspaceExtensionsModal } from '../extensions/WorkspaceExtensionsModal';

let sessionPanelModulePromise: Promise<typeof import('./SessionPanel')> | null = import('./SessionPanel');

function preloadSessionPanel() {
  sessionPanelModulePromise ??= import('./SessionPanel');
  return sessionPanelModulePromise;
}

const SessionPanel = lazy(async () => ({ default: (await preloadSessionPanel()).SessionPanel }));

const PAGE_SIZE = 5;
const AUTO_PREFETCH_DELAY_MS = 240;
const HOVER_PREFETCH_DELAY_MS = 120;
const SESSION_PREFETCH_TURNS = 12;
const LIVE_SESSION_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const sKey = (agent: string, id: string) => `${agent}:${id}`;

type SessionWithDepth = SessionInfo & { __forkDepth: number };

function groupForkDescendants(sessions: SessionInfo[]): SessionWithDepth[] {
  const byKey = new Map<string, SessionInfo>();
  for (const s of sessions) byKey.set(sKey(s.agent || '', s.sessionId), s);

  const childMap = new Map<string, SessionInfo[]>();
  const isForkChild = new Set<string>();
  for (const s of sessions) {
    const from = s.migratedFrom;
    if (!from || from.kind !== 'fork' || !from.sessionId) continue;
    const parentKey = sKey(from.agent || s.agent || '', from.sessionId);
    if (!byKey.has(parentKey)) continue;
    isForkChild.add(sKey(s.agent || '', s.sessionId));
    if (!childMap.has(parentKey)) childMap.set(parentKey, []);
    childMap.get(parentKey)!.push(s);
  }

  const out: SessionWithDepth[] = [];
  const seen = new Set<string>();
  const visit = (s: SessionInfo, depth: number) => {
    const key = sKey(s.agent || '', s.sessionId);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(Object.assign({}, s, { __forkDepth: depth }));
    const kids = childMap.get(key);
    if (!kids) return;
    for (const k of kids) visit(k, depth + 1);
  };
  for (const s of sessions) {
    const key = sKey(s.agent || '', s.sessionId);
    if (isForkChild.has(key)) continue;
    visit(s, 0);
  }
  for (const s of sessions) {
    visit(s, 0);
  }
  return out;
}

let _slotKeySeq = 0;
function nextMountKey() { return `mk-${Date.now().toString(36)}-${(++_slotKeySeq).toString(36)}`; }

function layoutGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return v;
    const legacy = sessionStorage.getItem(key);
    if (legacy != null) {
      try { localStorage.setItem(key, legacy); sessionStorage.removeItem(key); } catch {}
      return legacy;
    }
  } catch {}
  return null;
}
function layoutSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

type LayoutMode = 1 | 2 | 3 | 6;
const LAYOUT_LADDER: readonly LayoutMode[] = [1, 2, 3, 6];
const MAX_LAYOUT: LayoutMode = 6;

function fitLayout(count: number): LayoutMode {
  for (const m of LAYOUT_LADDER) if (m >= count) return m;
  return MAX_LAYOUT;
}

function defaultLayoutMode(): LayoutMode {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return w >= 1920 ? 3 : w >= 1280 ? 2 : 1;
}

function layoutForCount(count: number, floor: LayoutMode): LayoutMode {
  const fit = fitLayout(count);
  return fit > floor ? fit : floor;
}

type FilterMode = 'all' | 'running' | 'review';

function isOpenTarget(value: string | null | undefined): value is OpenTarget {
  return value === 'vscode'
    || value === 'cursor'
    || value === 'windsurf'
    || value === 'finder'
    || value === 'default';
}

function inferOpenTarget(hostApp: string | null, platform: string | null): OpenTarget {
  const normalized = String(hostApp || '').toLowerCase();
  if (normalized.includes('cursor')) return 'cursor';
  if (normalized.includes('windsurf')) return 'windsurf';
  if (normalized.includes('code')) return 'vscode';
  return platform === 'darwin' ? 'vscode' : 'default';
}

function targetLabelKey(target: OpenTarget) {
  switch (target) {
    case 'cursor': return 'hub.openTargetCursor';
    case 'windsurf': return 'hub.openTargetWindsurf';
    case 'finder': return 'hub.openTargetFinder';
    case 'default': return 'hub.openTargetDefault';
    case 'vscode':
    default:
      return 'hub.openTargetVsCode';
  }
}

export const SessionWorkspace = memo(function SessionWorkspace({
  active = true,
}: {
  active?: boolean;
}) {
  const locale = useStore(s => s.locale);
  const runtimeWorkdir = useStore(s => s.state?.runtimeWorkdir ?? null);
  const t = useMemo(() => createT(locale), [locale]);

  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [sessionsMap, setSessionsMap] = useState<Record<string, SessionInfo[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [sidebarLoading, setSidebarLoading] = useState(true);
  type SessionSlot = { agent: string; sessionId: string; workdir: string; mountKey: string; pendingPrompt?: string | null; pendingImageUrls?: string[] };

  const [layoutMode, setLayoutModeRaw] = useState<LayoutMode>(() => {
    const v = layoutGet('swarmdeck-layout-mode');
    if (v === '1' || v === '2' || v === '3' || v === '6') return Number(v) as LayoutMode;
    return defaultLayoutMode();
  });
  const [floorMode, setFloorModeRaw] = useState<LayoutMode>(() => {
    const v = layoutGet('swarmdeck-layout-floor');
    if (v === '1' || v === '2' || v === '3' || v === '6') return Number(v) as LayoutMode;
    return defaultLayoutMode();
  });
  const [openSessions, setOpenSessionsRaw] = useState<SessionSlot[]>(() => {
    try {
      const v = layoutGet('swarmdeck-open-sessions');
      if (v) {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.map((s: any) => ({ ...s, mountKey: s.mountKey || nextMountKey() }));
      }
    } catch {}
    return [];
  });
  const [activeSlotIndex, setActiveSlotIndexRaw] = useState(() => {
    const v = layoutGet('swarmdeck-active-slot');
    if (v != null) { const n = Number(v); if (Number.isFinite(n) && n >= 0) return n; }
    return 0;
  });

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeRaw(mode);
    layoutSet('swarmdeck-layout-mode', String(mode));
  }, []);
  const setFloorMode = useCallback((mode: LayoutMode) => {
    setFloorModeRaw(mode);
    layoutSet('swarmdeck-layout-floor', String(mode));
  }, []);
  const setOpenSessions = useCallback((updater: SessionSlot[] | ((prev: SessionSlot[]) => SessionSlot[])) => {
    setOpenSessionsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const persistable = next.map(({ pendingPrompt: _p, pendingImageUrls: _i, ...rest }) => rest);
      layoutSet('swarmdeck-open-sessions', JSON.stringify(persistable));
      return next;
    });
  }, []);
  const setActiveSlotIndex = useCallback((updater: number | ((prev: number) => number)) => {
    setActiveSlotIndexRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      layoutSet('swarmdeck-active-slot', String(next));
      return next;
    });
  }, []);
  const handleSelectLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    setFloorMode(mode);
  }, [setLayoutMode, setFloorMode]);

  useEffect(() => {
    setOpenSessions(prev => prev.length > layoutMode ? prev.slice(0, layoutMode) : prev);
    setActiveSlotIndex(prev => prev >= layoutMode ? layoutMode - 1 : prev);
  }, [layoutMode]);

  const [fileTreeOpen, setFileTreeOpen] = useState(false);

  const layoutModeRef = useRef(layoutMode);
  layoutModeRef.current = layoutMode;
  const floorModeRef = useRef(floorMode);
  floorModeRef.current = floorMode;
  const activeSlotRef = useRef(activeSlotIndex);
  activeSlotRef.current = activeSlotIndex;
  const openSessionsRef = useRef(openSessions);
  openSessionsRef.current = openSessions;
  const newSessionSlotRef = useRef(-1);

  const selectedSession = openSessions[activeSlotIndex] ?? null;
  // mountKey is optional for callers — this fills one in when absent (see withKey below).
  const setSelectedSession = useCallback((next: (Omit<SessionSlot, 'mountKey'> & { mountKey?: string }) | null) => {
    if (!next) {
      setOpenSessions([]);
      setActiveSlotIndex(0);
      return;
    }
    const withKey: SessionSlot = next.mountKey ? (next as SessionSlot) : { ...next, mountKey: nextMountKey() };
    setOpenSessions(prev => {
      const existingIdx = prev.findIndex(s => s.agent === withKey.agent && s.sessionId === withKey.sessionId);
      if (existingIdx >= 0) {
        setActiveSlotIndex(existingIdx);
        return prev;
      }
      if (prev.length < layoutModeRef.current) {
        const newList = [...prev, withKey];
        setActiveSlotIndex(newList.length - 1);
        return newList;
      }
      if (layoutModeRef.current < MAX_LAYOUT) {
        const newList = [...prev, withKey];
        setLayoutMode(layoutForCount(newList.length, floorModeRef.current));
        setActiveSlotIndex(newList.length - 1);
        return newList;
      }
      const newList = [...prev];
      newList[activeSlotRef.current] = withKey;
      return newList;
    });
  }, [setOpenSessions, setActiveSlotIndex, setLayoutMode]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showNewSession, setShowNewSession] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [liveSessionStates, setLiveSessionStates] = useState<Record<string, LiveSessionState>>({});
  const [promotionsByWs, setPromotionsByWs] = useState<Record<string, Record<string, string>>>({});
  const deferredSearch = useDeferredValue(search);
  const initializedRef = useRef(false);
  const inflightLoadsRef = useRef<Record<string, boolean>>({});
  const sessionsMapRef = useRef(sessionsMap);
  sessionsMapRef.current = sessionsMap;
  const liveSessionStatesRef = useRef(liveSessionStates);
  liveSessionStatesRef.current = liveSessionStates;
  const autoPrefetchedSessionsRef = useRef<Set<string>>(new Set());
  const hoverPrefetchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => () => {
    for (const timer of Object.values(hoverPrefetchTimersRef.current)) {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    setOpenSessions(prev => {
      let changed = false;
      const next = prev.map(slot => {
        const promos = promotionsByWs[slot.workdir];
        if (!promos) return slot;
        const canonical = resolveCanonicalSessionId(promos, slot.agent, slot.sessionId);
        if (canonical === slot.sessionId) return slot;
        changed = true;
        return { ...slot, sessionId: canonical };
      });
      return changed ? next : prev;
    });
  }, [promotionsByWs, setOpenSessions]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await api.getWorkspaces();
      const list = res.ok ? res.workspaces : [];
      if (list.length) {
        setWorkspaces(prev => (
          prev.length === list.length
          && prev.every((p, i) => p.path === list[i].path && p.name === list[i].name)
            ? prev
            : list
        ));
      }
      initializedRef.current = true;
    } catch {
      initializedRef.current = true;
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  const loadSessionsForWorkspace = useCallback(async (
    wsPath: string,
    opts: { background?: boolean; force?: boolean } = {},
  ) => {
    if (inflightLoadsRef.current[wsPath]) return;
    inflightLoadsRef.current[wsPath] = true;
    if (!opts.background) {
      setLoadingMap(prev => ({ ...prev, [wsPath]: true }));
    }
    try {
      const res = await loadWorkspaceSessions(wsPath, { force: opts.force });
      startTransition(() => {
        setPromotionsByWs(prev => {
          const next = res.promotions || {};
          const cur = prev[wsPath];
          if (cur && Object.keys(cur).length === Object.keys(next).length
              && Object.entries(next).every(([k, v]) => cur[k] === v)) return prev;
          return { ...prev, [wsPath]: next };
        });
        setSessionsMap(prev => {
          const incoming = res.sessions || [];
          const existing = prev[wsPath] || [];
          const incomingIds = new Set(incoming.map(s => sKey(s.agent || '', s.sessionId)));
          const stubs = existing.filter(s => {
            if (s.runState !== 'running') return false;
            const key = sKey(s.agent || '', s.sessionId);
