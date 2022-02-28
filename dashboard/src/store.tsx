import { create } from 'zustand';
import { api } from './api';
import { hasPendingChannelValidation } from './channel-status';
import type { AgentStatusResponse, AppState, HostInfo, SessionInfo } from './types';
import type { Locale } from './i18n';

export interface Toast {
  id: number;
  message: string;
  ok: boolean;
}

export type Theme = 'dark' | 'light';

export interface ModelLayer {
  providers: Array<{ id: string; name: string; kind: string; baseURL: string }>;
  profiles: Array<{ id: string; name: string; providerId: string; modelId: string; effort?: string | null }>;
  activeProfiles: Record<string, string | null>;
}

// Global model config (providers/profiles/agent bindings) is identical across every session
// panel, so it lives here once instead of being re-fetched by each InputComposer on mount.
let _modelLayerInFlight: Promise<ModelLayer | null> | null = null;

const CACHE_KEY = 'swarmdeck-store-cache';

interface CachedSlices {
  state: AppState | null;
  host: HostInfo | null;
  agentStatus: AgentStatusResponse | null;
}

function readCache(): CachedSlices {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CachedSlices;
  } catch {}
  return { state: null, host: null, agentStatus: null };
}

function writeCache(slices: Partial<CachedSlices>) {
  try {
    const prev = readCache();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...slices }));
  } catch {}
}

let _toastId = 0;

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('swarmdeck-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem('swarmdeck-locale');
    if (stored === 'en' || stored === 'zh-CN') return stored;
  } catch {}
