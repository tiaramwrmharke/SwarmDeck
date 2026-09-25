import { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { createT } from './i18n';
import { Sidebar, type RestartPhase } from './components/Sidebar';
import { Spinner, Toasts } from './components/ui';
import { api } from './api';
import { getEndpoint } from './endpoint';
import { getDashboardTabMeta, type DashboardTab } from './tabs';
import { cn } from './utils';

const SessionsTab = lazy(async () => ({ default: (await import('./pages/sessions')).SessionWorkspace }));
const AgentTab = lazy(() => import('./pages/agents/AgentTab'));
const IMAccessTab = lazy(async () => ({ default: (await import('./pages/im/IMAccessTab')).IMAccessTab }));
const ExtensionsTab = lazy(async () => ({ default: (await import('./pages/extensions/ExtensionsTab')).ExtensionsTab }));
const SystemTab = lazy(async () => ({ default: (await import('./pages/system/SystemTab')).SystemTab }));
const TelegramModal = lazy(async () => ({ default: (await import('./components/Modals')).TelegramModal }));
const FeishuModal = lazy(async () => ({ default: (await import('./components/Modals')).FeishuModal }));
const WeixinModal = lazy(async () => ({ default: (await import('./components/Modals')).WeixinModal }));
const SlackModal = lazy(async () => ({ default: (await import('./components/Modals')).SlackModal }));
const DiscordModal = lazy(async () => ({ default: (await import('./components/Modals')).DiscordModal }));
const DingtalkModal = lazy(async () => ({ default: (await import('./components/Modals')).DingtalkModal }));
const WeComModal = lazy(async () => ({ default: (await import('./components/Modals')).WeComModal }));
const WorkdirModal = lazy(async () => ({ default: (await import('./components/Modals')).WorkdirModal }));
const BrowserSetupModal = lazy(async () => ({ default: (await import('./components/Modals')).BrowserSetupModal }));
const ConnectionModal = lazy(async () => ({ default: (await import('./components/ConnectionModal')).ConnectionModal }));

type ModalState =
  | null
  | { type: 'weixin' }
  | { type: 'telegram' }
  | { type: 'feishu' }
  | { type: 'slack' }
  | { type: 'discord' }
  | { type: 'dingtalk' }
  | { type: 'wecom' }
  | { type: 'workdir' }
  | { type: 'browser-setup' }
  | { type: 'connection' };

function locationToTab(pathname: string): DashboardTab {
  const map: Record<string, DashboardTab> = {
    '/': 'sessions',
    '/im': 'im',
    '/agents': 'agents',
    '/extensions': 'extensions',
    '/permissions': 'system',
    '/system': 'system',
  };
  return map[pathname] || 'sessions';
}

function PageWrapper({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] px-5 py-3">
        <div className="mb-3 border-b border-edge pb-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
            {description && <div className="mt-0.5 text-[13px] leading-relaxed text-fg-4">{description}</div>}
          </div>
        </div>
        {children}
      </div>
