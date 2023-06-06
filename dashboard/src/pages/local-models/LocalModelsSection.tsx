import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import type { Locale } from '../../i18n';
import type {
  LocalBackendStatus,
  LocalBackendOs,
  LocalModelCatalogEntry,
  OllamaLibModel,
  OllamaLibSize,
} from '../../types';
import { BrandIcon } from '../../components/BrandIcon';
import { Badge, Button, Spinner, Modal, ModalHeader } from '../../components/ui';
import { ActionBar } from '../shared';

const RAM_HEADROOM_GB = 4;

interface Copy {
  sectionLabel: string;
  hostLabel: string;
  hostUnknown: string;
  refresh: string;
  refreshing: string;
  loadFailed: string;

  tileStatusDetected: string;
  tileStatusNotDetected: string;
  tileStatusUnsupported: string;
  tileBadgeReady: (n: number) => string;
  tileBlurbOllama: string;
  tileBlurbMlx: string;
  tileInstalledModels: (n: number) => string;

  modalTitle: (label: string) => string;
  modalDescription: (label: string) => string;
  stepStatus: string;
  stepModels: string;

  statusRunning: string;
  statusNotRunning: string;
  statusUnsupportedDesc: (label: string) => string;
  statusRecheck: string;
  statusRechecking: string;
  statusInstallHeader: string;
  statusInstallDocs: string;
  statusRunHint: string;
  statusHomepageCta: string;
  statusAutoAttachedHint: (label: string) => string;

  modelsInstalledHeader: (n: number) => string;
  modelsInstalledEmpty: string;
  modelsRecommendedHeader: string;
  modelsBackendOffline: string;
  fitOk: string;
  fitTight: string;
  fitNoGo: string;
  modelInstalledBadge: string;
  pullPrefix: string;
  copyCommand: string;
  copied: string;

  libHeader: string;
  libVia: string;
  libLoading: string;
  libErrorFallback: string;
  libStale: string;
  libSearchPlaceholder: (total: number) => string;
  libClearSearch: string;
  libFitLabel: string;
  libFilterRunnable: string;
  libFilterAll: string;
  libCapsLabel: string;
  libShowing: (n: number) => string;
  libEmpty: string;
  libClearFilters: string;
  libPullsSuffix: string;
  libUpdatedPrefix: string;
  libSizeHint: string;
  libRetry: string;

  closeBtn: string;
}

function getCopy(locale: Locale): Copy {
  if (locale === 'zh-CN') {
    return {
      sectionLabel: '本地后端',
      hostLabel: '本机',
      hostUnknown: '检测中…',
      refresh: '刷新',
      refreshing: '刷新中…',
      loadFailed: '加载失败',

      tileStatusDetected: '已运行',
      tileStatusNotDetected: '未检测到',
      tileStatusUnsupported: '不支持当前系统',
      tileBadgeReady: n => `${n} 个模型已就绪`,
      tileBlurbOllama: '跨平台默认，CLI 友好，模型下载到本地后常驻',
      tileBlurbMlx: 'Apple Silicon 原生，性能压榨极限，按需启动',
      tileInstalledModels: n => `${n} 个模型`,

      modalTitle: label => `准备 ${label}`,
      modalDescription: label => `安装 ${label}、下载所需模型、核对运行状态——本地模型的全部配置都在这里完成。`,
      stepStatus: '后端状态',
      stepModels: '模型',

      statusRunning: '已运行',
      statusNotRunning: '未在本机检测到此后端',
      statusUnsupportedDesc: label => `${label} 不支持当前系统。`,
      statusRecheck: '重新检测',
      statusRechecking: '检测中…',
      statusInstallHeader: '安装命令',
      statusInstallDocs: '官方安装文档',
      statusRunHint: '启动服务（安装后）',
      statusHomepageCta: '官网',
      statusAutoAttachedHint: label => `本地 ${label} 已在运行；继续在下方下载并核对所需模型。`,

      modelsInstalledHeader: n => `已就绪（${n}）`,
      modelsInstalledEmpty: '后端在线，但尚未加载任何模型。在终端按下方命令准备一个。',
      modelsRecommendedHeader: '推荐模型 · 在终端执行以下命令准备',
      modelsBackendOffline: '启动后端后再返回此处准备模型。',
      fitOk: '推荐',
      fitTight: '勉强可跑',
      fitNoGo: '内存不足',
      modelInstalledBadge: '已就绪',
      pullPrefix: '终端执行',
      copyCommand: '复制',
      copied: '已复制',

      libHeader: '可下载模型',
      libVia: '来自 ollama.com 模型库',
      libLoading: '正在从 Ollama 模型库加载…',
      libErrorFallback: '无法连接 Ollama 模型库，已回退到内置推荐清单。',
      libStale: '展示的是缓存列表（最近一次刷新失败）。',
      libSearchPlaceholder: total => `在 ${total} 个模型中搜索，如 qwen、coder、vision…`,
      libClearSearch: '清除搜索',
      libFitLabel: '内存',
      libFilterRunnable: '本机可跑',
      libFilterAll: '全部',
      libCapsLabel: '能力',
      libShowing: n => `显示 ${n} 个模型`,
      libEmpty: '没有符合条件的模型。',
      libClearFilters: '清除筛选',
      libPullsSuffix: '次下载',
      libUpdatedPrefix: '更新于',
      libSizeHint: '点击尺寸复制 pull 命令',
      libRetry: '重试',

      closeBtn: '完成',
    };
  }
  return {
    sectionLabel: 'Local backends',
    hostLabel: 'This machine',
    hostUnknown: 'Detecting…',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    loadFailed: 'Failed to load local backends',

    tileStatusDetected: 'Running',
    tileStatusNotDetected: 'Not detected',
    tileStatusUnsupported: 'Not supported on this OS',
    tileBadgeReady: n => `${n} models ready`,
    tileBlurbOllama: 'Cross-platform default, CLI-friendly, models persist on disk',
    tileBlurbMlx: 'Apple Silicon native, peak performance, on-demand launch',
    tileInstalledModels: n => `${n} models`,

    modalTitle: label => `Prepare ${label}`,
    modalDescription: label => `Install ${label}, download the models you want, and verify they're running — all the local-model configuration lives in this panel.`,
    stepStatus: 'Backend status',
    stepModels: 'Models',

    statusRunning: 'Running',
    statusNotRunning: 'Backend not detected on this machine',
    statusUnsupportedDesc: label => `${label} does not run on this OS.`,
    statusRecheck: 'Re-check',
    statusRechecking: 'Checking…',
    statusInstallHeader: 'Install commands',
    statusInstallDocs: 'Official install docs',
    statusRunHint: 'Start the server (after install)',
    statusHomepageCta: 'Homepage',
    statusAutoAttachedHint: label => `Local ${label} is running. Continue below to download and verify the models you need.`,

    modelsInstalledHeader: n => `Ready (${n})`,
    modelsInstalledEmpty: 'Backend is up but no model is loaded. Use the command below to prepare one.',
    modelsRecommendedHeader: 'Recommended models — run these in your terminal',
    modelsBackendOffline: 'Start the backend first, then come back to prepare models.',
    fitOk: 'Recommended',
    fitTight: 'Tight fit',
    fitNoGo: 'Not enough RAM',
    modelInstalledBadge: 'Ready',
    pullPrefix: 'Run in terminal',
    copyCommand: 'Copy',
    copied: 'Copied',

    libHeader: 'Downloadable models',
    libVia: 'from the ollama.com library',
    libLoading: 'Loading the Ollama model library…',
    libErrorFallback: 'Could not reach the Ollama library; showing the built-in picks instead.',
    libStale: 'Showing a cached list (the latest refresh failed).',
    libSearchPlaceholder: total => `Search ${total} models — e.g. qwen, coder, vision…`,
    libClearSearch: 'Clear search',
    libFitLabel: 'Memory',
    libFilterRunnable: 'Runs here',
    libFilterAll: 'All',
    libCapsLabel: 'Skills',
    libShowing: n => `${n} models`,
    libEmpty: 'No models match these filters.',
    libClearFilters: 'Clear filters',
    libPullsSuffix: 'pulls',
    libUpdatedPrefix: 'updated',
    libSizeHint: 'Click a size to copy its pull command',
    libRetry: 'Retry',

    closeBtn: 'Done',
  };
}

type Fit = 'ok' | 'tight' | 'no-go';

function fitFor(totalGb: number | null, minRamGb: number): Fit {
  if (totalGb === null) return 'tight';
  if (totalGb >= minRamGb + RAM_HEADROOM_GB) return 'ok';
  if (totalGb >= minRamGb) return 'tight';
  return 'no-go';
}

function pullCommandFor(backend: LocalBackendStatus, entry: LocalModelCatalogEntry): string | null {
  const id = backend.id === 'ollama' ? entry.ollamaTag : entry.mlxModel;
  if (!id) return null;
  return backend.pullCommandTemplate.replace('${model}', id);
}

function formatGb(bytes: number | undefined | null): string {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

function formatModelSize(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

function catalogFor(backend: LocalBackendStatus, catalog: LocalModelCatalogEntry[]): LocalModelCatalogEntry[] {
  return catalog.filter(e => backend.id === 'ollama' ? !!e.ollamaTag : !!e.mlxModel);
}

function entryInstalledOn(entry: LocalModelCatalogEntry, backend: LocalBackendStatus): string | null {
  const tag = backend.id === 'ollama' ? entry.ollamaTag : entry.mlxModel;
  if (!tag) return null;
  const base = tag.split(':')[0].toLowerCase();
  for (const m of backend.models) {
    if (m.id.toLowerCase().startsWith(base)) return m.id;
  }
  return null;
}

export interface LocalBackendsSnapshot {
  backends: LocalBackendStatus[];
  catalog: LocalModelCatalogEntry[];
  currentOs: LocalBackendOs | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<{ addedProviderIds: string[] }>;
}

export function useLocalBackends(): LocalBackendsSnapshot {
  const [backends, setBackends] = useState<LocalBackendStatus[]>([]);
  const [catalog, setCatalog] = useState<LocalModelCatalogEntry[]>([]);
  const [currentOs, setCurrentOs] = useState<LocalBackendOs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<{ addedProviderIds: string[] }> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.probeLocalModels();
      if (!res.ok) throw new Error(res.error || 'Failed to load local backends');
      setBackends(res.backends || []);
      setCatalog(res.catalog || []);
      setCurrentOs(res.currentOs ?? null);
      return { addedProviderIds: res.addedProviderIds ?? [] };
    } catch (e: any) {
      setError(e?.message || String(e));
      return { addedProviderIds: [] };
    } finally {
      setLoading(false);
    }
  }, []);
